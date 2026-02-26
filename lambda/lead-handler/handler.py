"""
polizalab-lead-handler (Python 3.12)
Manages the Leads entity for PolizaLab CRM.
Routes:
  GET    /leads
  GET    /leads/{leadId}
  POST   /leads
  PATCH  /leads/{leadId}
  POST   /leads/{leadId}/log-contact
  POST   /leads/{leadId}/convert
  DELETE /leads/{leadId}
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

# Import must work when shared module is deployed alongside handler
try:
    from shared.auto_activity import create_auto_activity
except ImportError:
    create_auto_activity = None

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ──────────────────────────────────────────────────────────────
LEADS_TABLE = os.environ.get("LEADS_TABLE", "Leads")
CLIENTS_TABLE = os.environ.get("CLIENTS_TABLE", "Clients")
POLICIES_TABLE = os.environ.get("POLICIES_TABLE", "Policies")
ACTIVITIES_TABLE = os.environ.get("ACTIVITIES_TABLE", "Activities")
TENANT_ID = os.environ.get("TENANT_ID", "default")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

# ── Valid enum values ────────────────────────────────────────────────────────
VALID_STATUSES = {"NEW", "CONTACTED", "QUOTING", "WON", "LOST"}
VALID_PRODUCT_INTERESTS = {"AUTO", "VIDA", "GMM", "HOGAR", "PYME", "OTRO"}
VALID_SOURCES = {"WHATSAPP", "REFERIDO", "WEB", "FACEBOOK", "EVENTO", "OTRO"}
VALID_NEXT_ACTION_TYPES = {"CALL", "WHATSAPP", "EMAIL", "MEETING", "FOLLOWUP"}

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


# ── Validation ───────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
_MX10_RE = re.compile(r"^\d{10}$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?.*)?$")


def validate_lead_fields(body: dict, is_create: bool = True) -> tuple[dict | None, dict | None]:
    """Validate and sanitize lead input fields.
    Returns (sanitized_dict, error_response) -- exactly one will be None.
    """
    errors = []
    sanitized: dict = {}

    # fullName (required on create)
    full_name = (body.get("fullName") or "").strip()
    if is_create:
        if not full_name:
            errors.append("fullName is required")
        elif len(full_name) > 200:
            errors.append("fullName must be 200 characters or fewer")
        sanitized["fullName"] = full_name
    elif "fullName" in body:
        if not full_name or len(full_name) > 200:
            errors.append("fullName must be 1-200 characters")
        sanitized["fullName"] = full_name

    # phone (required on create)
    if "phone" in body or is_create:
        phone = (body.get("phone") or "").strip()
        if is_create and not phone:
            errors.append("phone is required")
        if phone:
            if _MX10_RE.match(phone):
                phone = "+52" + phone
            elif not _E164_RE.match(phone):
                errors.append("phone must be E.164 format or a 10-digit Mexican number")
            sanitized["phone"] = phone
        elif not is_create:
            sanitized["phone"] = phone or None

    # email (optional)
    if "email" in body:
        email = (body.get("email") or "").strip().lower()
        if email and not _EMAIL_RE.match(email):
            errors.append("email is not a valid email address")
        sanitized["email"] = email or None

    # productInterest (required on create)
    if "productInterest" in body or is_create:
        pi = (body.get("productInterest") or "").strip().upper()
        if is_create and not pi:
            errors.append("productInterest is required")
        if pi and pi not in VALID_PRODUCT_INTERESTS:
            errors.append(f"productInterest must be one of: {', '.join(sorted(VALID_PRODUCT_INTERESTS))}")
        if pi:
            sanitized["productInterest"] = pi

    # status
    if "status" in body:
        status = (body.get("status") or "").strip().upper()
        if status and status not in VALID_STATUSES:
            errors.append(f"status must be one of: {', '.join(sorted(VALID_STATUSES))}")
        if status:
            sanitized["status"] = status

    # source (optional)
    if "source" in body:
        source = (body.get("source") or "").strip().upper()
        if source and source not in VALID_SOURCES:
            errors.append(f"source must be one of: {', '.join(sorted(VALID_SOURCES))}")
        sanitized["source"] = source or None

    # sourceDetail (optional free text)
    if "sourceDetail" in body:
        sd = (body.get("sourceDetail") or "").strip()
        if sd and len(sd) > 500:
            errors.append("sourceDetail must be 500 characters or fewer")
        sanitized["sourceDetail"] = sd or None

    # assignedToUserId (optional)
    if "assignedToUserId" in body:
        sanitized["assignedToUserId"] = (body.get("assignedToUserId") or "").strip() or None

    # nextActionAt (optional ISO date)
    if "nextActionAt" in body:
        na = (body.get("nextActionAt") or "").strip()
        if na and not _ISO_DATE_RE.match(na):
            errors.append("nextActionAt must be a valid ISO date")
        sanitized["nextActionAt"] = na or None

    # nextActionType (optional)
    if "nextActionType" in body:
        nat = (body.get("nextActionType") or "").strip().upper()
        if nat and nat not in VALID_NEXT_ACTION_TYPES:
            errors.append(f"nextActionType must be one of: {', '.join(sorted(VALID_NEXT_ACTION_TYPES))}")
        sanitized["nextActionType"] = nat or None

    # notes (optional)
    if "notes" in body:
        notes = (body.get("notes") or "").strip()
        if notes:
            notes = re.sub(r"[^\S\n]+", " ", notes)
        if notes and len(notes) > 2000:
            errors.append("notes must be 2000 characters or fewer")
        sanitized["notes"] = notes or None

    # tags (optional string array)
    if "tags" in body:
        tags = body.get("tags")
        if tags is not None:
            if not isinstance(tags, list):
                errors.append("tags must be an array of strings")
            elif len(tags) > 20:
                errors.append("tags can have at most 20 entries")
            else:
                cleaned_tags = [str(t).strip() for t in tags if str(t).strip()]
                sanitized["tags"] = cleaned_tags if cleaned_tags else None
        else:
            sanitized["tags"] = None

    if errors:
        return None, resp(400, {"error": "Validation failed", "details": errors})

    return sanitized, None


# ── Duplicate detection ──────────────────────────────────────────────────────

def _check_lead_duplicate_by_phone(phone: str, exclude_lead_id: str | None = None) -> dict | None:
    """Check if a lead with the same phone exists in the same tenant."""
    table = get_dynamodb().Table(LEADS_TABLE)
    result = table.query(
        IndexName="phone-index",
        KeyConditionExpression=(
            Key("tenantId").eq(TENANT_ID) & Key("phone").eq(phone)
        ),
        Limit=5,
    )
    for item in result.get("Items", []):
        if exclude_lead_id and item.get("leadId") == exclude_lead_id:
            continue
        # Only flag non-converted, non-lost leads
        if item.get("status") not in ("WON", "LOST"):
            return item
    return None


# ── Route handlers ───────────────────────────────────────────────────────────

def list_leads(user_id: str, query_params: dict) -> dict:
    table = get_dynamodb().Table(LEADS_TABLE)

    limit_raw = query_params.get("limit", "50")
    try:
        limit = min(max(int(limit_raw), 1), 100)
    except (ValueError, TypeError):
        limit = 50

    next_token = query_params.get("nextToken")
    search = (query_params.get("search") or "").strip().lower()
    status_filter = (query_params.get("status") or "").strip().upper()
    product_filter = (query_params.get("productInterest") or "").strip().upper()
    source_filter = (query_params.get("source") or "").strip().upper()
    sort_by = (query_params.get("sort") or "recent").strip()

    # Default: query by userId via GSI
    query_kwargs: dict = {
        "IndexName": "userId-createdAt-index",
        "KeyConditionExpression": Key("userId").eq(user_id),
        "ScanIndexForward": False,  # newest first by default
        "Limit": limit,
    }

    filter_parts = []

    if status_filter and status_filter in VALID_STATUSES:
        filter_parts.append(Attr("status").eq(status_filter))

    if product_filter and product_filter in VALID_PRODUCT_INTERESTS:
        filter_parts.append(Attr("productInterest").eq(product_filter))

    if source_filter and source_filter in VALID_SOURCES:
        filter_parts.append(Attr("source").eq(source_filter))

    if search:
        search_filter = (
            Attr("fullName").contains(search)
            | Attr("phone").contains(search)
            | Attr("email").contains(search)
        )
        filter_parts.append(search_filter)

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
    leads = result.get("Items", [])

    response_body: dict = {"leads": leads, "count": len(leads)}

    last_key = result.get("LastEvaluatedKey")
    if last_key:
        response_body["nextToken"] = json.dumps(last_key, default=str)

    return resp(200, response_body)


def get_lead(user_id: str, lead_id: str) -> dict:
    table = get_dynamodb().Table(LEADS_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "leadId": lead_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Lead not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})
    return resp(200, item)


def create_lead(user_id: str, body: dict) -> dict:
    sanitized, error = validate_lead_fields(body, is_create=True)
    if error:
        return error

    # Optional duplicate check by phone
    phone = sanitized.get("phone")
    if phone:
        existing = _check_lead_duplicate_by_phone(phone)
        if existing:
            return resp(200, {
                "lead": existing,
                "created": False,
                "duplicateOf": existing.get("leadId"),
                "message": "A lead with this phone already exists",
            })

    now = now_iso()
    lead_id = str(uuid.uuid4())

    item: dict = {
        "tenantId": TENANT_ID,
        "leadId": lead_id,
        "userId": user_id,
        "createdByUserId": user_id,
        "fullName": sanitized["fullName"],
        "phone": sanitized.get("phone"),
        "email": sanitized.get("email"),
        "status": sanitized.get("status", "NEW"),
        "productInterest": sanitized.get("productInterest", "OTRO"),
        "source": sanitized.get("source"),
        "sourceDetail": sanitized.get("sourceDetail"),
        "assignedToUserId": sanitized.get("assignedToUserId") or user_id,
        "nextActionAt": sanitized.get("nextActionAt"),
        "nextActionType": sanitized.get("nextActionType"),
        "notes": sanitized.get("notes"),
        "tags": sanitized.get("tags"),
        "timeline": [],
        "lastContactAt": None,
        "convertedClientId": None,
        "convertedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }

    # Remove None values so sparse GSI fields are not indexed
    sparse_fields = (
        "email", "source", "sourceDetail", "nextActionAt", "nextActionType",
        "notes", "tags", "lastContactAt", "convertedClientId", "convertedAt",
    )
    for field in sparse_fields:
        if item.get(field) is None:
            del item[field]

    # DynamoDB doesn't allow empty lists, but timeline=[] is fine via put_item
    table = get_dynamodb().Table(LEADS_TABLE)
    table.put_item(Item=item)

    # Auto-trigger: create CONTACTO_INICIAL activity
    if create_auto_activity is not None:
        try:
            create_auto_activity(
                activities_table=ACTIVITIES_TABLE,
                tenant_id=TENANT_ID,
                user_id=user_id,
                tipo_codigo="CONTACTO_INICIAL",
                due_date=now[:10],  # today
                entity_type="LEAD",
                entity_id=lead_id,
            )
        except Exception as e:
            logger.warning("Failed to create auto-activity for lead %s: %s", lead_id, e)

    logger.info("Lead created: leadId=%s userId=%s", lead_id, user_id)
    return resp(201, {"lead": item, "created": True})


def patch_lead(user_id: str, lead_id: str, body: dict) -> dict:
    table = get_dynamodb().Table(LEADS_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "leadId": lead_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Lead not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Prevent editing converted leads
    if item.get("convertedClientId"):
        return resp(400, {"error": "Cannot edit a converted lead"})

    allowed_fields = {
        "fullName", "phone", "email", "status", "productInterest",
        "source", "sourceDetail", "assignedToUserId",
        "nextActionAt", "nextActionType", "notes", "tags",
    }
    patch_body = {k: v for k, v in body.items() if k in allowed_fields}
    if not patch_body:
        return resp(400, {"error": "No updatable fields provided"})

    sanitized, error = validate_lead_fields(patch_body, is_create=False)
    if error:
        return error

    update_expressions = []
    expr_names: dict = {}
    expr_values: dict = {}

    for field, value in sanitized.items():
        update_expressions.append(f"#{field} = :{field}")
        expr_names[f"#{field}"] = field
        expr_values[f":{field}"] = value

    now = now_iso()
    update_expressions.append("updatedAt = :updatedAt")
    expr_values[":updatedAt"] = now

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "leadId": lead_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names if expr_names else None,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info("Lead updated: leadId=%s userId=%s", lead_id, user_id)
    return resp(200, updated)


def log_contact(user_id: str, lead_id: str, body: dict) -> dict:
    """Append a timeline event to a lead and update lastContactAt."""
    table = get_dynamodb().Table(LEADS_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "leadId": lead_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Lead not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Validate timeline entry
    contact_type = (body.get("type") or "").strip().upper()
    if contact_type and contact_type not in VALID_NEXT_ACTION_TYPES:
        return resp(400, {"error": f"type must be one of: {', '.join(sorted(VALID_NEXT_ACTION_TYPES))}"})

    note = (body.get("note") or "").strip()
    if not note and not contact_type:
        return resp(400, {"error": "Provide at least a type or a note"})
    if note and len(note) > 2000:
        return resp(400, {"error": "note must be 2000 characters or fewer"})

    now = now_iso()
    timeline_entry = {
        "id": str(uuid.uuid4()),
        "type": contact_type or "FOLLOWUP",
        "note": note,
        "createdAt": now,
        "createdByUserId": user_id,
    }

    # Append to timeline list and update lastContactAt
    update_expr = (
        "SET lastContactAt = :now, updatedAt = :now "
        "SET timeline = list_append(if_not_exists(timeline, :empty), :entry)"
    )
    # Use a single UpdateExpression with combined SET clauses
    result = table.update_item(
        Key={"tenantId": TENANT_ID, "leadId": lead_id},
        UpdateExpression=(
            "SET lastContactAt = :now, updatedAt = :now, "
            "timeline = list_append(if_not_exists(timeline, :empty), :entry)"
        ),
        ExpressionAttributeValues={
            ":now": now,
            ":entry": [timeline_entry],
            ":empty": [],
        },
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info("Contact logged for lead: leadId=%s userId=%s", lead_id, user_id)
    return resp(200, updated)


def convert_lead(user_id: str, lead_id: str, body: dict) -> dict:
    """Convert a lead to a client. Creates or links to an existing client."""
    leads_table = get_dynamodb().Table(LEADS_TABLE)
    result = leads_table.get_item(Key={"tenantId": TENANT_ID, "leadId": lead_id})
    lead = result.get("Item")
    if not lead:
        return resp(404, {"error": "Lead not found"})
    if lead.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Already converted?
    if lead.get("convertedClientId"):
        return resp(400, {
            "error": "Lead already converted",
            "convertedClientId": lead.get("convertedClientId"),
        })

    # Parse lead name into firstName/lastName
    full_name = lead.get("fullName", "").strip()
    name_parts = full_name.split(" ", 1)
    first_name = name_parts[0] if name_parts else full_name
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    phone = lead.get("phone")
    email = lead.get("email")

    # Check for existing client by phone or email
    clients_table = get_dynamodb().Table(CLIENTS_TABLE)
    existing_client = None
    matched_field = None

    if phone:
        phone_result = clients_table.query(
            IndexName="phone-index",
            KeyConditionExpression=(
                Key("tenantId").eq(TENANT_ID) & Key("phone").eq(phone)
            ),
            Limit=1,
        )
        items = phone_result.get("Items", [])
        if items:
            existing_client = items[0]
            matched_field = "phone"

    if not existing_client and email:
        email_result = clients_table.query(
            IndexName="email-index",
            KeyConditionExpression=(
                Key("tenantId").eq(TENANT_ID) & Key("email").eq(email)
            ),
            Limit=1,
        )
        items = email_result.get("Items", [])
        if items:
            existing_client = items[0]
            matched_field = "email"

    # If force_link is true and existing client found, link directly
    force_link = body.get("forceLink", False)
    link_client_id = body.get("linkClientId")

    now = now_iso()

    if link_client_id:
        # User explicitly chose to link to an existing client
        client_result = clients_table.get_item(
            Key={"tenantId": TENANT_ID, "clientId": link_client_id}
        )
        client = client_result.get("Item")
        if not client:
            return resp(404, {"error": "Target client not found"})
        if client.get("userId") != user_id:
            return resp(403, {"error": "Forbidden"})

        # Mark lead as converted
        leads_table.update_item(
            Key={"tenantId": TENANT_ID, "leadId": lead_id},
            UpdateExpression=(
                "SET #status = :won, convertedClientId = :clientId, "
                "convertedAt = :now, updatedAt = :now"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":won": "WON",
                ":clientId": link_client_id,
                ":now": now,
            },
        )
        logger.info(
            "Lead converted (linked): leadId=%s clientId=%s",
            lead_id, link_client_id,
        )
        return resp(200, {
            "success": True,
            "clientId": link_client_id,
            "action": "linked",
        })

    if existing_client and not force_link:
        # Return duplicate info so frontend can show confirmation
        return resp(200, {
            "success": False,
            "existingClient": {
                "clientId": existing_client.get("clientId"),
                "firstName": existing_client.get("firstName"),
                "lastName": existing_client.get("lastName"),
                "field": matched_field,
            },
            "action": "duplicate_found",
        })

    # Create new client
    client_id = str(uuid.uuid4())
    client_item: dict = {
        "tenantId": TENANT_ID,
        "clientId": client_id,
        "userId": user_id,
        "firstName": first_name,
        "lastName": last_name,
        "email": email,
        "phone": phone,
        "status": "active",
        "createdFrom": "lead_conversion",
        "originLeadId": lead_id,
        "policyCount": 0,
        "createdAt": now,
        "updatedAt": now,
    }
    # Remove None sparse fields
    for sparse_field in ("email", "phone"):
        if client_item.get(sparse_field) is None:
            del client_item[sparse_field]

    clients_table.put_item(Item=client_item)

    # Mark lead as converted
    leads_table.update_item(
        Key={"tenantId": TENANT_ID, "leadId": lead_id},
        UpdateExpression=(
            "SET #status = :won, convertedClientId = :clientId, "
            "convertedAt = :now, updatedAt = :now"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":won": "WON",
            ":clientId": client_id,
            ":now": now,
        },
    )

    logger.info(
        "Lead converted (new client): leadId=%s clientId=%s",
        lead_id, client_id,
    )
    return resp(201, {
        "success": True,
        "clientId": client_id,
        "action": "created",
        "client": client_item,
    })


def delete_lead(user_id: str, lead_id: str) -> dict:
    table = get_dynamodb().Table(LEADS_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "leadId": lead_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Lead not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    table.delete_item(Key={"tenantId": TENANT_ID, "leadId": lead_id})
    logger.info("Lead deleted: leadId=%s userId=%s", lead_id, user_id)
    return resp(200, {"success": True, "leadId": lead_id})


# ── Main handler ─────────────────────────────────────────────────────────────

def _safe_log_event(event: dict) -> dict:
    """Return a redacted copy of the event safe for CloudWatch logging."""
    safe = {
        "httpMethod": (
            event.get("requestContext", {}).get("http", {}).get("method")
            or event.get("httpMethod", "")
        ),
        "path": event.get("rawPath") or event.get("path", ""),
        "pathParameters": event.get("pathParameters"),
        "queryStringParameters": {
            k: v for k, v in (event.get("queryStringParameters") or {}).items()
            if k not in ("email", "phone")
        },
        "hasBody": bool(event.get("body")),
    }
    return safe


def handler(event: dict, context=None) -> dict:
    logger.info("Request: %s", json.dumps(_safe_log_event(event)))

    user_id = extract_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "")
    )
    path = event.get("rawPath") or event.get("path", "")
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    try:
        body_str = event.get("body") or "{}"
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        return resp(400, {"error": "Invalid JSON body"})

    try:
        lead_id = path_params.get("leadId")

        # ── GET /leads
        if method == "GET" and path == "/leads":
            return list_leads(user_id, query_params)

        # ── GET /leads/{leadId}
        if method == "GET" and path.startswith("/leads/") and lead_id:
            return get_lead(user_id, lead_id)

        # ── POST /leads
        if method == "POST" and path == "/leads":
            return create_lead(user_id, body)

        # ── POST /leads/{leadId}/log-contact
        if method == "POST" and lead_id and path.endswith("/log-contact"):
            return log_contact(user_id, lead_id, body)

        # ── POST /leads/{leadId}/convert
        if method == "POST" and lead_id and path.endswith("/convert"):
            return convert_lead(user_id, lead_id, body)

        # ── PATCH /leads/{leadId}
        if method == "PATCH" and lead_id:
            return patch_lead(user_id, lead_id, body)

        # ── DELETE /leads/{leadId}
        if method == "DELETE" and lead_id:
            return delete_lead(user_id, lead_id)

        return resp(404, {"error": "Not found"})

    except ClientError as e:
        logger.error("AWS ClientError: %s", e.response["Error"])
        return resp(500, {"error": "Internal server error"})
    except Exception:
        logger.exception("Unhandled error")
        return resp(500, {"error": "Internal server error"})
