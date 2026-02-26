"""
polizalab-opportunity-handler (Python 3.12)
Manages the Opportunities entity for PolizaLab CRM.

Routes:
  GET    /opportunities
  POST   /opportunities
  GET    /opportunities/{opportunityId}
  PATCH  /opportunities/{opportunityId}
  DELETE /opportunities/{opportunityId}
  POST   /opportunities/{opportunityId}/advance
  POST   /opportunities/{opportunityId}/close-won
  POST   /opportunities/{opportunityId}/close-lost
  POST   /opportunities/{opportunityId}/quotes
"""
from __future__ import annotations

import json
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

try:
    from shared.auto_activity import create_auto_activity
except ImportError:
    create_auto_activity = None

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ──────────────────────────────────────────────────────────────
OPPORTUNITIES_TABLE = os.environ.get("OPPORTUNITIES_TABLE", "Opportunities")
ACTIVITIES_TABLE    = os.environ.get("ACTIVITIES_TABLE",    "Activities")
SYSTEM_TABLE        = os.environ.get("SYSTEM_TABLE",        "ActivityTypesSystem")
TENANT_ID           = os.environ.get("TENANT_ID",           "default")
ALLOWED_ORIGIN      = os.environ.get("ALLOWED_ORIGIN",      "*")

# ── Valid enum values ────────────────────────────────────────────────────────
VALID_PRODUCTS = {"AUTO", "VIDA", "GMM", "HOGAR", "PYME", "OTRO"}

VALID_STAGES = {
    "CALIFICAR",
    "DATOS_MINIMOS",
    "COTIZANDO",
    "PROPUESTA_ENVIADA",
    "NEGOCIACION",
    "GANADA",
    "PERDIDA",
}

# Ordered list — position determines which stages are "before" or "after".
# GANADA and PERDIDA are terminal and excluded from normal advance.
STAGE_ORDER = [
    "CALIFICAR",
    "DATOS_MINIMOS",
    "COTIZANDO",
    "PROPUESTA_ENVIADA",
    "NEGOCIACION",
    "GANADA",
    "PERDIDA",
]

TERMINAL_STAGES   = {"GANADA", "PERDIDA"}
CLOSEABLE_STAGES  = {"GANADA", "PERDIDA"}   # only reachable via dedicated routes

VALID_LOST_REASONS = {
    "PRECIO",
    "COBERTURA",
    "COMPETENCIA",
    "SIN_RESPUESTA",
    "CAMBIO_PLANES",
    "OTRO",
}

VALID_COMMISSION_TYPES = {"PCT", "AMOUNT"}

# ── AWS clients ──────────────────────────────────────────────────────────────
_dynamodb = None


def get_dynamodb():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    return _dynamodb


# ── Helpers ──────────────────────────────────────────────────────────────────

def _cors_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    }


def resp(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": _cors_headers(),
        "body": json.dumps(body, default=str),
    }


def extract_user_id(event: dict) -> str | None:
    """Extract Cognito sub from authorizer context or JWT header."""
    try:
        sub = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub")
        )
        if sub:
            return sub
    except Exception:
        pass

    auth_header = (event.get("headers") or {}).get(
        "Authorization", (event.get("headers") or {}).get("authorization", "")
    )
    if not auth_header:
        return None
    try:
        import base64
        token = auth_header.replace("Bearer ", "")
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub")
    except Exception:
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stage_index(stage: str) -> int:
    """Return the position of a stage in STAGE_ORDER, or -1 if not found."""
    try:
        return STAGE_ORDER.index(stage)
    except ValueError:
        return -1


# ── Validation ───────────────────────────────────────────────────────────────

def _to_decimal(value) -> Decimal | None:
    """Safely coerce a numeric value to Decimal for DynamoDB storage."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def validate_opportunity_fields(
    body: dict,
    is_create: bool = True,
) -> tuple[dict | None, dict | None]:
    """Validate and sanitize opportunity input fields.

    Returns (sanitized_dict, error_response) — exactly one will be None.
    """
    errors: list[str] = []
    sanitized: dict = {}

    # product (required on create)
    if "product" in body or is_create:
        product = (body.get("product") or "").strip().upper()
        if is_create and not product:
            errors.append("product is required")
        if product and product not in VALID_PRODUCTS:
            errors.append(
                f"product must be one of: {', '.join(sorted(VALID_PRODUCTS))}"
            )
        if product:
            sanitized["product"] = product

    # leadId / clientId — at least one required on create
    if is_create:
        lead_id   = (body.get("leadId")   or "").strip()
        client_id = (body.get("clientId") or "").strip()
        if not lead_id and not client_id:
            errors.append("At least one of leadId or clientId is required")
        if lead_id:
            sanitized["leadId"] = lead_id
        if client_id:
            sanitized["clientId"] = client_id

    # entityName (optional free text — name of the insured entity/person)
    if "entityName" in body:
        entity_name = (body.get("entityName") or "").strip()
        if entity_name and len(entity_name) > 300:
            errors.append("entityName must be 300 characters or fewer")
        sanitized["entityName"] = entity_name or None

    # stage (optional on create, defaults to CALIFICAR)
    if "stage" in body:
        stage = (body.get("stage") or "").strip().upper()
        if stage and stage not in VALID_STAGES:
            errors.append(
                f"stage must be one of: {', '.join(sorted(VALID_STAGES))}"
            )
        if stage:
            sanitized["stage"] = stage

    # commissionType
    if "commissionType" in body:
        ct = (body.get("commissionType") or "").strip().upper()
        if ct and ct not in VALID_COMMISSION_TYPES:
            errors.append(
                f"commissionType must be one of: {', '.join(sorted(VALID_COMMISSION_TYPES))}"
            )
        sanitized["commissionType"] = ct or None

    # commissionValue (numeric)
    if "commissionValue" in body:
        cv = _to_decimal(body.get("commissionValue"))
        if body.get("commissionValue") is not None and cv is None:
            errors.append("commissionValue must be a number")
        elif cv is not None and cv < 0:
            errors.append("commissionValue must be non-negative")
        sanitized["commissionValue"] = cv

    # estimatedPremium (numeric)
    if "estimatedPremium" in body:
        ep = _to_decimal(body.get("estimatedPremium"))
        if body.get("estimatedPremium") is not None and ep is None:
            errors.append("estimatedPremium must be a number")
        elif ep is not None and ep < 0:
            errors.append("estimatedPremium must be non-negative")
        sanitized["estimatedPremium"] = ep

    # currency (optional, e.g. "MXN", "USD")
    if "currency" in body:
        currency = (body.get("currency") or "").strip().upper()
        if currency and len(currency) != 3:
            errors.append("currency must be a 3-letter ISO code (e.g. MXN, USD)")
        sanitized["currency"] = currency or None

    # notes (optional)
    if "notes" in body:
        notes = (body.get("notes") or "").strip()
        if notes:
            notes = re.sub(r"[^\S\n]+", " ", notes)
        if notes and len(notes) > 2000:
            errors.append("notes must be 2000 characters or fewer")
        sanitized["notes"] = notes or None

    if errors:
        return None, resp(400, {"error": "Validation failed", "details": errors})

    return sanitized, None


# ── Route handlers ───────────────────────────────────────────────────────────

def list_opportunities(user_id: str, query_params: dict) -> dict:
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)

    limit_raw = query_params.get("limit", "50")
    try:
        limit = min(max(int(limit_raw), 1), 100)
    except (ValueError, TypeError):
        limit = 50

    next_token    = query_params.get("nextToken")
    stage_filter  = (query_params.get("stage")   or "").strip().upper()
    product_filter = (query_params.get("product") or "").strip().upper()

    query_kwargs: dict = {
        "IndexName": "userId-createdAt-index",
        "KeyConditionExpression": Key("userId").eq(user_id),
        "ScanIndexForward": False,  # newest first
        "Limit": limit,
    }

    filter_parts = []

    if stage_filter and stage_filter in VALID_STAGES:
        filter_parts.append(Attr("stage").eq(stage_filter))

    if product_filter and product_filter in VALID_PRODUCTS:
        filter_parts.append(Attr("product").eq(product_filter))

    if filter_parts:
        combined = filter_parts[0]
        for part in filter_parts[1:]:
            combined = combined & part
        query_kwargs["FilterExpression"] = combined

    if next_token:
        try:
            decoded = json.loads(next_token)
            query_kwargs["ExclusiveStartKey"] = decoded
        except Exception:
            return resp(400, {"error": "Invalid nextToken"})

    result = table.query(**query_kwargs)
    opportunities = result.get("Items", [])

    response_body: dict = {
        "opportunities": opportunities,
        "count": len(opportunities),
    }

    last_key = result.get("LastEvaluatedKey")
    if last_key:
        response_body["nextToken"] = json.dumps(last_key, default=str)

    return resp(200, response_body)


def get_opportunity(user_id: str, opportunity_id: str) -> dict:
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})
    return resp(200, item)


def create_opportunity(user_id: str, body: dict) -> dict:
    sanitized, error = validate_opportunity_fields(body, is_create=True)
    if error:
        return error

    now = now_iso()
    opportunity_id = str(uuid.uuid4())
    initial_stage  = sanitized.get("stage", "CALIFICAR")

    item: dict = {
        "tenantId":        TENANT_ID,
        "opportunityId":   opportunity_id,
        "userId":          user_id,
        "createdByUserId": user_id,
        "product":         sanitized["product"],
        "stage":           initial_stage,
        "stageHistory": [
            {
                "stage":          initial_stage,
                "changedAt":      now,
                "changedByUserId": user_id,
            }
        ],
        "quotes":   [],
        "createdAt": now,
        "updatedAt": now,
    }

    # Sparse reference fields — only written if present
    for field in ("leadId", "clientId", "entityName", "commissionType",
                  "commissionValue", "estimatedPremium", "currency", "notes"):
        value = sanitized.get(field)
        if value is not None:
            item[field] = value

    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    table.put_item(Item=item)

    logger.info(
        "Opportunity created: opportunityId=%s userId=%s product=%s stage=%s",
        opportunity_id, user_id, item["product"], initial_stage,
    )
    return resp(201, {"opportunity": item, "created": True})


def patch_opportunity(user_id: str, opportunity_id: str, body: dict) -> dict:
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Prevent editing closed opportunities
    current_stage = item.get("stage", "")
    if current_stage in TERMINAL_STAGES:
        return resp(400, {
            "error": f"Cannot edit an opportunity in stage {current_stage}",
        })

    allowed_fields = {
        "entityName", "product", "commissionType", "commissionValue",
        "estimatedPremium", "currency", "notes",
    }
    patch_body = {k: v for k, v in body.items() if k in allowed_fields}
    if not patch_body:
        return resp(400, {"error": "No updatable fields provided"})

    sanitized, error = validate_opportunity_fields(patch_body, is_create=False)
    if error:
        return error

    update_expressions: list[str] = []
    expr_names: dict  = {}
    expr_values: dict = {}

    for field, value in sanitized.items():
        update_expressions.append(f"#{field} = :{field}")
        expr_names[f"#{field}"]  = field
        expr_values[f":{field}"] = value

    now = now_iso()
    update_expressions.append("updatedAt = :updatedAt")
    expr_values[":updatedAt"] = now

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names if expr_names else None,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info(
        "Opportunity updated: opportunityId=%s userId=%s",
        opportunity_id, user_id,
    )
    return resp(200, updated)


def delete_opportunity(user_id: str, opportunity_id: str) -> dict:
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    table.delete_item(Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id})
    logger.info(
        "Opportunity deleted: opportunityId=%s userId=%s",
        opportunity_id, user_id,
    )
    return resp(200, {"success": True, "opportunityId": opportunity_id})


def advance_opportunity(user_id: str, opportunity_id: str, body: dict) -> dict:
    """Advance the opportunity to a later stage.

    Rules:
    - targetStage must be valid and come AFTER current stage in STAGE_ORDER.
    - Cannot advance if currently GANADA or PERDIDA (terminal).
    - Cannot advance directly to GANADA or PERDIDA — use close-won/close-lost.
    """
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    current_stage = item.get("stage", "CALIFICAR")

    if current_stage in TERMINAL_STAGES:
        return resp(400, {
            "error": f"Cannot advance an opportunity that is already {current_stage}",
        })

    target_stage = (body.get("targetStage") or "").strip().upper()
    if not target_stage:
        return resp(400, {"error": "targetStage is required"})
    if target_stage not in VALID_STAGES:
        return resp(400, {
            "error": f"targetStage must be one of: {', '.join(sorted(VALID_STAGES))}",
        })

    # Forbid skipping to terminal stages — dedicated routes handle those
    if target_stage in TERMINAL_STAGES:
        return resp(400, {
            "error": (
                "Use POST /close-won or POST /close-lost to move to "
                f"{target_stage}"
            ),
        })

    current_idx = _stage_index(current_stage)
    target_idx  = _stage_index(target_stage)

    if target_idx <= current_idx:
        return resp(400, {
            "error": (
                f"targetStage '{target_stage}' must come after the current "
                f"stage '{current_stage}' in the pipeline"
            ),
        })

    now = now_iso()
    history_entry = {
        "stage":           target_stage,
        "changedAt":       now,
        "changedByUserId": user_id,
    }

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id},
        UpdateExpression=(
            "SET #stage = :stage, updatedAt = :now, "
            "stageHistory = list_append(if_not_exists(stageHistory, :empty), :entry)"
        ),
        ExpressionAttributeNames={"#stage": "stage"},
        ExpressionAttributeValues={
            ":stage": target_stage,
            ":now":   now,
            ":entry": [history_entry],
            ":empty": [],
        },
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info(
        "Opportunity advanced: opportunityId=%s %s -> %s userId=%s",
        opportunity_id, current_stage, target_stage, user_id,
    )

    # Auto-trigger: PROPUESTA_ENVIADA → SEGUIMIENTO_COTIZACION +48h
    if target_stage == "PROPUESTA_ENVIADA" and create_auto_activity is not None:
        try:
            from datetime import timedelta
            due = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()[:10]
            create_auto_activity(
                activities_table=ACTIVITIES_TABLE,
                tenant_id=TENANT_ID,
                user_id=user_id,
                tipo_codigo="SEGUIMIENTO_COTIZACION",
                due_date=due,
                entity_type="OPPORTUNITY",
                entity_id=opportunity_id,
            )
        except Exception as e:
            logger.warning("Failed to auto-create SEGUIMIENTO_COTIZACION: %s", e)

    return resp(200, {"opportunity": updated})


def close_won_opportunity(user_id: str, opportunity_id: str, body: dict) -> dict:
    """Mark the opportunity as GANADA."""
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    current_stage = item.get("stage", "")
    if current_stage in TERMINAL_STAGES:
        return resp(400, {
            "error": f"Opportunity is already {current_stage}",
        })

    now = now_iso()
    history_entry = {
        "stage":           "GANADA",
        "changedAt":       now,
        "changedByUserId": user_id,
    }

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id},
        UpdateExpression=(
            "SET #stage = :stage, closedAt = :now, updatedAt = :now, "
            "stageHistory = list_append(if_not_exists(stageHistory, :empty), :entry)"
        ),
        ExpressionAttributeNames={"#stage": "stage"},
        ExpressionAttributeValues={
            ":stage": "GANADA",
            ":now":   now,
            ":entry": [history_entry],
            ":empty": [],
        },
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info(
        "Opportunity closed-won: opportunityId=%s userId=%s",
        opportunity_id, user_id,
    )

    # Auto-trigger: close-won → CONFIRMAR_PAGO +24h
    if create_auto_activity is not None:
        try:
            from datetime import timedelta
            due = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()[:10]
            create_auto_activity(
                activities_table=ACTIVITIES_TABLE,
                tenant_id=TENANT_ID,
                user_id=user_id,
                tipo_codigo="CONFIRMAR_PAGO",
                due_date=due,
                entity_type="OPPORTUNITY",
                entity_id=opportunity_id,
            )
        except Exception as e:
            logger.warning("Failed to auto-create CONFIRMAR_PAGO: %s", e)

    # ctaUploadPolicy signals the frontend to prompt for policy document upload
    return resp(200, {"opportunity": updated, "ctaUploadPolicy": True})


def close_lost_opportunity(user_id: str, opportunity_id: str, body: dict) -> dict:
    """Mark the opportunity as PERDIDA with a mandatory reason."""
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    current_stage = item.get("stage", "")
    if current_stage in TERMINAL_STAGES:
        return resp(400, {
            "error": f"Opportunity is already {current_stage}",
        })

    reason = (body.get("reason") or "").strip().upper()
    if not reason:
        return resp(400, {"error": "reason is required"})
    if reason not in VALID_LOST_REASONS:
        return resp(400, {
            "error": (
                f"reason must be one of: {', '.join(sorted(VALID_LOST_REASONS))}"
            ),
        })

    close_notes = (body.get("notes") or "").strip()
    if close_notes:
        close_notes = re.sub(r"[^\S\n]+", " ", close_notes)
    if close_notes and len(close_notes) > 2000:
        return resp(400, {"error": "notes must be 2000 characters or fewer"})

    now = now_iso()
    history_entry = {
        "stage":           "PERDIDA",
        "changedAt":       now,
        "changedByUserId": user_id,
        "reason":          reason,
    }

    update_expr = (
        "SET #stage = :stage, closedAt = :now, closedReason = :reason, "
        "updatedAt = :now, "
        "stageHistory = list_append(if_not_exists(stageHistory, :empty), :entry)"
    )
    expr_values: dict = {
        ":stage":  "PERDIDA",
        ":now":    now,
        ":reason": reason,
        ":entry":  [history_entry],
        ":empty":  [],
    }

    if close_notes:
        update_expr += ", closedNotes = :closedNotes"
        expr_values[":closedNotes"] = close_notes

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames={"#stage": "stage"},
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info(
        "Opportunity closed-lost: opportunityId=%s reason=%s userId=%s",
        opportunity_id, reason, user_id,
    )
    return resp(200, {"opportunity": updated})


def add_quote(user_id: str, opportunity_id: str, body: dict) -> dict:
    """Append a quote to the opportunity's quotes list."""
    table = get_dynamodb().Table(OPPORTUNITIES_TABLE)
    result = table.get_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id}
    )
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Opportunity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Validate required fields
    insurer = (body.get("insurer") or "").strip()
    if not insurer:
        return resp(400, {"error": "insurer is required"})
    if len(insurer) > 200:
        return resp(400, {"error": "insurer must be 200 characters or fewer"})

    premium_raw = body.get("premium")
    if premium_raw is None:
        return resp(400, {"error": "premium is required"})
    premium = _to_decimal(premium_raw)
    if premium is None:
        return resp(400, {"error": "premium must be a number"})
    if premium < 0:
        return resp(400, {"error": "premium must be non-negative"})

    terms = (body.get("terms") or "").strip()
    if terms and len(terms) > 1000:
        return resp(400, {"error": "terms must be 1000 characters or fewer"})

    now = now_iso()
    quote_entry: dict = {
        "id":        str(uuid.uuid4()),
        "insurer":   insurer,
        "premium":   premium,
        "createdAt": now,
    }
    if terms:
        quote_entry["terms"] = terms

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "opportunityId": opportunity_id},
        UpdateExpression=(
            "SET quotes = list_append(if_not_exists(quotes, :empty), :quote), "
            "updatedAt = :now"
        ),
        ExpressionAttributeValues={
            ":quote": [quote_entry],
            ":empty": [],
            ":now":   now,
        },
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info(
        "Quote added: opportunityId=%s quoteId=%s insurer=%s userId=%s",
        opportunity_id, quote_entry["id"], insurer, user_id,
    )
    return resp(201, {"opportunity": updated, "quote": quote_entry})


# ── Main handler ─────────────────────────────────────────────────────────────

def _safe_log_event(event: dict) -> dict:
    """Return a redacted copy of the event safe for CloudWatch logging."""
    return {
        "httpMethod": (
            event.get("requestContext", {}).get("http", {}).get("method")
            or event.get("httpMethod", "")
        ),
        "path": event.get("rawPath") or event.get("path", ""),
        "pathParameters": event.get("pathParameters"),
        "queryStringParameters": event.get("queryStringParameters"),
        "hasBody": bool(event.get("body")),
    }


def handler(event: dict, context=None) -> dict:
    logger.info("Request: %s", json.dumps(_safe_log_event(event)))

    user_id = extract_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "")
    )
    path        = event.get("rawPath") or event.get("path", "")
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    try:
        body_str = event.get("body") or "{}"
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        return resp(400, {"error": "Invalid JSON body"})

    try:
        opportunity_id = path_params.get("opportunityId")

        # ── GET /opportunities
        if method == "GET" and path == "/opportunities":
            return list_opportunities(user_id, query_params)

        # ── POST /opportunities
        if method == "POST" and path == "/opportunities":
            return create_opportunity(user_id, body)

        # ── GET /opportunities/{opportunityId}
        if method == "GET" and opportunity_id and not path.split("/opportunities/", 1)[-1].count("/"):
            return get_opportunity(user_id, opportunity_id)

        # ── PATCH /opportunities/{opportunityId}
        if method == "PATCH" and opportunity_id and path == f"/opportunities/{opportunity_id}":
            return patch_opportunity(user_id, opportunity_id, body)

        # ── DELETE /opportunities/{opportunityId}
        if method == "DELETE" and opportunity_id:
            return delete_opportunity(user_id, opportunity_id)

        # ── POST /opportunities/{opportunityId}/advance
        if method == "POST" and opportunity_id and path.endswith("/advance"):
            return advance_opportunity(user_id, opportunity_id, body)

        # ── POST /opportunities/{opportunityId}/close-won
        if method == "POST" and opportunity_id and path.endswith("/close-won"):
            return close_won_opportunity(user_id, opportunity_id, body)

        # ── POST /opportunities/{opportunityId}/close-lost
        if method == "POST" and opportunity_id and path.endswith("/close-lost"):
            return close_lost_opportunity(user_id, opportunity_id, body)

        # ── POST /opportunities/{opportunityId}/quotes
        if method == "POST" and opportunity_id and path.endswith("/quotes"):
            return add_quote(user_id, opportunity_id, body)

        return resp(404, {"error": "Not found"})

    except ClientError as e:
        logger.error("AWS ClientError: %s", e.response["Error"])
        return resp(500, {"error": "Internal server error"})
    except Exception:
        logger.exception("Unhandled error")
        return resp(500, {"error": "Internal server error"})
