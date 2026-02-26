"""
polizalab-activity-handler (Python 3.12)
Manages the Activities entity for PolizaLab CRM.

Routes:
  GET    /activities                                — list with filters
  GET    /activities/today                          — "Empezar mi dia" buckets
  GET    /activities/{activityId}                   — get single activity
  POST   /activities                                — create activity
  PATCH  /activities/{activityId}                   — update fields
  POST   /activities/{activityId}/complete          — mark as HECHA
  POST   /activities/{activityId}/cancel            — mark as CANCELADA
  POST   /activities/{activityId}/reschedule        — reschedule dueDate
  DELETE /activities/{activityId}                   — delete activity
  GET    /activities/by-entity/{entityType}/{entityId} — list by linked entity
"""
from __future__ import annotations

import json
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ───────────────────────────────────────────────────────────────
ACTIVITIES_TABLE = os.environ.get("ACTIVITIES_TABLE", "Activities")
SYSTEM_TABLE     = os.environ.get("SYSTEM_TABLE",     "ActivityTypesSystem")
TENANT_ID        = os.environ.get("TENANT_ID",        "default")
ALLOWED_ORIGIN   = os.environ.get("ALLOWED_ORIGIN",   "*")

# ── Valid enum values ─────────────────────────────────────────────────────────
VALID_STATUSES     = {"PENDIENTE", "HECHA", "CANCELADA"}
VALID_ENTITY_TYPES = {"LEAD", "CLIENT", "OPPORTUNITY"}

# Mexico City offset (UTC-6, no DST awareness needed for CRM scheduling)
_MX_OFFSET = timedelta(hours=-6)

# ── AWS clients ───────────────────────────────────────────────────────────────
_dynamodb = None


def get_dynamodb():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    return _dynamodb


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _today_utc() -> str:
    """Return today's date in UTC as YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _week_bounds_utc() -> tuple[str, str]:
    """Return (monday_date, sunday_date) strings for the current ISO week (UTC)."""
    now = datetime.now(timezone.utc)
    # Monday = weekday 0
    monday = now - timedelta(days=now.weekday())
    sunday = monday + timedelta(days=6)
    return monday.strftime("%Y-%m-%d"), sunday.strftime("%Y-%m-%d")


def _date_part(iso_string: str) -> str:
    """Extract YYYY-MM-DD from an ISO datetime or date string."""
    return (iso_string or "")[:10]


def _build_entity_composite(entity_type: str | None, entity_id: str | None) -> str | None:
    """Build the entityType_entityId GSI partition key, e.g. 'LEAD#uuid'."""
    if entity_type and entity_id:
        return f"{entity_type.upper()}#{entity_id}"
    return None


def _remove_none_fields(item: dict, fields: tuple) -> None:
    """Delete sparse field keys whose value is None in-place."""
    for field in fields:
        if item.get(field) is None:
            item.pop(field, None)


# ── Type code validation ──────────────────────────────────────────────────────

def _validate_tipo_codigo(tipo_codigo: str) -> bool:
    """Check that tipoCodigo exists in the SYSTEM_TABLE under partitionKey='SYSTEM'."""
    table = get_dynamodb().Table(SYSTEM_TABLE)
    try:
        result = table.get_item(
            Key={"partitionKey": "SYSTEM", "code": tipo_codigo}
        )
        return bool(result.get("Item"))
    except ClientError as e:
        logger.warning(
            "Could not validate tipoCodigo=%s: %s", tipo_codigo, e.response["Error"]
        )
        # Fail open so a misconfigured table does not block all activity creation.
        # The deployer should ensure SYSTEM_TABLE is seeded before going live.
        return False


# ── Route handlers ────────────────────────────────────────────────────────────

def list_activities(user_id: str, query_params: dict) -> dict:
    """GET /activities — paginated list with optional filters."""
    table = get_dynamodb().Table(ACTIVITIES_TABLE)

    limit_raw = query_params.get("limit", "50")
    try:
        limit = min(max(int(limit_raw), 1), 100)
    except (ValueError, TypeError):
        limit = 50

    next_token  = query_params.get("nextToken")
    status_f    = (query_params.get("status") or "").strip().upper()
    entity_f    = (query_params.get("entityType") or "").strip().upper()
    date_from   = (query_params.get("dateFrom") or "").strip()
    date_to     = (query_params.get("dateTo") or "").strip()
    view        = (query_params.get("view") or "").strip().lower()
    search      = (query_params.get("search") or "").strip().lower()

    # Choose index based on view mode
    if view == "agenda":
        index_name = "assignedTo-scheduledAt-index"
        sort_key   = "scheduledAt"
    else:
        index_name = "assignedTo-dueDate-index"
        sort_key   = "dueDate"

    # Build KeyConditionExpression
    key_cond = Key("assignedTo").eq(user_id)
    if date_from and date_to:
        key_cond = key_cond & Key(sort_key).between(date_from, date_to)
    elif date_from:
        key_cond = key_cond & Key(sort_key).gte(date_from)
    elif date_to:
        key_cond = key_cond & Key(sort_key).lte(date_to)

    query_kwargs: dict = {
        "IndexName": index_name,
        "KeyConditionExpression": key_cond,
        "ScanIndexForward": True,   # ascending by date
        "Limit": limit,
    }

    filter_parts = []

    if status_f and status_f in VALID_STATUSES:
        filter_parts.append(Attr("status").eq(status_f))

    if entity_f and entity_f in VALID_ENTITY_TYPES:
        filter_parts.append(Attr("entityType").eq(entity_f))

    if search:
        filter_parts.append(
            Attr("tipoCodigo").contains(search)
            | Attr("notes").contains(search)
        )

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

    result     = table.query(**query_kwargs)
    activities = result.get("Items", [])

    response_body: dict = {"activities": activities, "count": len(activities)}

    last_key = result.get("LastEvaluatedKey")
    if last_key:
        response_body["nextToken"] = json.dumps(last_key, default=str)

    return resp(200, response_body)


def get_today(user_id: str) -> dict:
    """GET /activities/today — 'Empezar mi dia' bucketed view."""
    table = get_dynamodb().Table(ACTIVITIES_TABLE)

    today         = _today_utc()
    monday, sunday = _week_bounds_utc()

    # Fetch all PENDIENTE activities assigned to the user via the dueDate index.
    # We do not paginate here — 50 per bucket is the hard cap.
    query_kwargs: dict = {
        "IndexName": "assignedTo-dueDate-index",
        "KeyConditionExpression": Key("assignedTo").eq(user_id),
        "FilterExpression": Attr("status").eq("PENDIENTE"),
        "ScanIndexForward": True,
    }

    # Collect all matching items (handle internal pagination transparently)
    all_items: list = []
    while True:
        result = table.query(**query_kwargs)
        all_items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key or len(all_items) >= 500:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    atrasadas: list  = []
    hoy: list        = []
    esta_semana: list = []

    for item in all_items:
        due = _date_part(item.get("dueDate", ""))
        if not due:
            continue
        if due < today:
            atrasadas.append(item)
        elif due == today:
            hoy.append(item)
        elif monday <= due <= sunday:
            esta_semana.append(item)
        # Future items beyond this week are ignored in this view

    # Sort each bucket ascending by dueDate, cap at 50
    def _sort_key(x: dict) -> str:
        return x.get("dueDate", "")

    atrasadas   = sorted(atrasadas,   key=_sort_key)[:50]
    hoy         = sorted(hoy,         key=_sort_key)[:50]
    esta_semana = sorted(esta_semana, key=_sort_key)[:50]

    return resp(200, {
        "atrasadas":   atrasadas,
        "hoy":         hoy,
        "estaSemana":  esta_semana,
        "counts": {
            "atrasadas":  len(atrasadas),
            "hoy":        len(hoy),
            "estaSemana": len(esta_semana),
        },
    })


def get_by_entity(user_id: str, entity_type: str, entity_id: str) -> dict:
    """GET /activities/by-entity/{entityType}/{entityId} — list linked to an entity."""
    if entity_type.upper() not in VALID_ENTITY_TYPES:
        return resp(400, {"error": f"entityType must be one of: {', '.join(sorted(VALID_ENTITY_TYPES))}"})

    table         = get_dynamodb().Table(ACTIVITIES_TABLE)
    composite_key = _build_entity_composite(entity_type, entity_id)

    result = table.query(
        IndexName="entity-index",
        KeyConditionExpression=Key("entityType_entityId").eq(composite_key),
        ScanIndexForward=False,   # newest first
        Limit=100,
    )

    activities = result.get("Items", [])
    return resp(200, {"activities": activities, "count": len(activities)})


def get_activity(user_id: str, activity_id: str) -> dict:
    """GET /activities/{activityId} — fetch single activity."""
    table  = get_dynamodb().Table(ACTIVITIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    item   = result.get("Item")
    if not item:
        return resp(404, {"error": "Activity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})
    return resp(200, item)


def create_activity(user_id: str, body: dict) -> dict:
    """POST /activities — create a new activity."""
    # ── Required fields ───────────────────────────────────────────────────────
    tipo_codigo = (body.get("tipoCodigo") or "").strip().upper()
    if not tipo_codigo:
        return resp(400, {"error": "tipoCodigo is required"})

    due_date = (body.get("dueDate") or "").strip()
    if not due_date:
        return resp(400, {"error": "dueDate is required"})

    # ── Validate tipoCodigo against system table ───────────────────────────────
    if not _validate_tipo_codigo(tipo_codigo):
        return resp(400, {"error": f"tipoCodigo '{tipo_codigo}' is not a recognised activity type"})

    # ── Optional fields ───────────────────────────────────────────────────────
    entity_type       = (body.get("entityType") or "").strip().upper() or None
    entity_id         = (body.get("entityId") or "").strip() or None
    client_id         = (body.get("clientId") or "").strip() or None
    scheduled_at      = (body.get("scheduledAt") or "").strip() or None
    reminder_at       = (body.get("reminderAt") or "").strip() or None
    notes             = (body.get("notes") or "").strip() or None
    outcomes          = body.get("outcomes") if isinstance(body.get("outcomes"), list) else None
    checklist         = body.get("checklist") if isinstance(body.get("checklist"), list) else None
    assigned_to_user  = (body.get("assignedToUserId") or "").strip() or user_id
    auto_generated    = bool(body.get("autoGenerated", False))

    if entity_type and entity_type not in VALID_ENTITY_TYPES:
        return resp(400, {"error": f"entityType must be one of: {', '.join(sorted(VALID_ENTITY_TYPES))}"})

    composite = _build_entity_composite(entity_type, entity_id)

    # ── Anti-spam check for auto-generated activities ─────────────────────────
    if auto_generated and composite:
        table = get_dynamodb().Table(ACTIVITIES_TABLE)
        dupe_result = table.query(
            IndexName="entity-index",
            KeyConditionExpression=Key("entityType_entityId").eq(composite),
            FilterExpression=(
                Attr("status").eq("PENDIENTE")
                & Attr("autoGenerated").eq(True)
                & Attr("tipoCodigo").eq(tipo_codigo)
            ),
            Limit=1,
        )
        dupes = dupe_result.get("Items", [])
        if dupes:
            return resp(200, {
                "activity": dupes[0],
                "created":  False,
                "reason":   "duplicate_auto_activity",
            })

    now         = now_iso()
    activity_id = str(uuid.uuid4())

    item: dict = {
        "tenantId":           TENANT_ID,
        "activityId":         activity_id,
        "userId":             user_id,
        "tipoCodigo":         tipo_codigo,
        "status":             "PENDIENTE",
        "dueDate":            due_date,
        "assignedTo":         assigned_to_user,
        "assignedToUserId":   assigned_to_user,
        "autoGenerated":      auto_generated,
        # sparse / optional
        "entityType":         entity_type,
        "entityId":           entity_id,
        "entityType_entityId": composite,
        "clientId":           client_id,
        "scheduledAt":        scheduled_at,
        "reminderAt":         reminder_at,
        "notes":              notes,
        "outcomes":           outcomes,
        "checklist":          checklist,
        # timestamps
        "createdAt":          now,
        "updatedAt":          now,
    }

    # Strip None so sparse GSI keys are not stored
    _sparse = (
        "entityType", "entityId", "entityType_entityId", "clientId",
        "scheduledAt", "reminderAt", "notes", "outcomes", "checklist",
    )
    _remove_none_fields(item, _sparse)

    table = get_dynamodb().Table(ACTIVITIES_TABLE)
    table.put_item(Item=item)

    logger.info(
        "Activity created: activityId=%s userId=%s tipoCodigo=%s",
        activity_id, user_id, tipo_codigo,
    )
    return resp(201, {"activity": item, "created": True})


def patch_activity(user_id: str, activity_id: str, body: dict) -> dict:
    """PATCH /activities/{activityId} — update allowed fields."""
    table  = get_dynamodb().Table(ACTIVITIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    item   = result.get("Item")
    if not item:
        return resp(404, {"error": "Activity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    allowed = {
        "tipoCodigo", "dueDate", "scheduledAt", "reminderAt",
        "notes", "outcomes", "checklist", "assignedToUserId",
        "entityType", "entityId", "clientId",
    }
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        return resp(400, {"error": "No updatable fields provided"})

    # Validate tipoCodigo if being changed
    if "tipoCodigo" in patch:
        tc = (patch["tipoCodigo"] or "").strip().upper()
        if not tc or not _validate_tipo_codigo(tc):
            return resp(400, {"error": f"tipoCodigo '{tc}' is not a recognised activity type"})
        patch["tipoCodigo"] = tc

    # Recalculate composite key if either entityType or entityId changed
    entity_type = patch.get("entityType", item.get("entityType"))
    entity_id   = patch.get("entityId",   item.get("entityId"))
    if "entityType" in patch or "entityId" in patch:
        new_composite = _build_entity_composite(entity_type, entity_id)
        patch["entityType_entityId"] = new_composite

    now = now_iso()

    update_expressions = []
    expr_names: dict   = {}
    expr_values: dict  = {}

    for field, value in patch.items():
        update_expressions.append(f"#{field} = :{field}")
        expr_names[f"#{field}"]  = field
        expr_values[f":{field}"] = value

    update_expressions.append("#updatedAt = :updatedAt")
    expr_names["#updatedAt"]    = "updatedAt"
    expr_values[":updatedAt"]   = now

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "activityId": activity_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info("Activity updated: activityId=%s userId=%s", activity_id, user_id)
    return resp(200, updated)


def complete_activity(user_id: str, activity_id: str, body: dict) -> dict:
    """POST /activities/{activityId}/complete — mark as HECHA."""
    table  = get_dynamodb().Table(ACTIVITIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    item   = result.get("Item")
    if not item:
        return resp(404, {"error": "Activity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    current_status = item.get("status")
    if current_status in ("HECHA", "CANCELADA"):
        return resp(400, {
            "error": f"Cannot complete an activity that is already {current_status}",
            "status": current_status,
        })

    now = now_iso()
    update_expressions = [
        "#status = :status",
        "#completedAt = :completedAt",
        "#updatedAt = :updatedAt",
    ]
    expr_names = {
        "#status":      "status",
        "#completedAt": "completedAt",
        "#updatedAt":   "updatedAt",
    }
    expr_values = {
        ":status":      "HECHA",
        ":completedAt": now,
        ":updatedAt":   now,
    }

    # Optionally persist outcomes / notes provided at completion time
    outcomes = body.get("outcomes")
    if outcomes is not None and isinstance(outcomes, list):
        update_expressions.append("#outcomes = :outcomes")
        expr_names["#outcomes"]  = "outcomes"
        expr_values[":outcomes"] = outcomes

    notes = (body.get("notes") or "").strip()
    if notes:
        update_expressions.append("#notes = :notes")
        expr_names["#notes"]  = "notes"
        expr_values[":notes"] = notes

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "activityId": activity_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info("Activity completed: activityId=%s userId=%s", activity_id, user_id)
    return resp(200, updated)


def cancel_activity(user_id: str, activity_id: str) -> dict:
    """POST /activities/{activityId}/cancel — mark as CANCELADA."""
    table  = get_dynamodb().Table(ACTIVITIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    item   = result.get("Item")
    if not item:
        return resp(404, {"error": "Activity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    current_status = item.get("status")
    if current_status in ("HECHA", "CANCELADA"):
        return resp(400, {
            "error": f"Cannot cancel an activity that is already {current_status}",
            "status": current_status,
        })

    now    = now_iso()
    result = table.update_item(
        Key={"tenantId": TENANT_ID, "activityId": activity_id},
        UpdateExpression=(
            "SET #status = :status, #cancelledAt = :cancelledAt, #updatedAt = :updatedAt"
        ),
        ExpressionAttributeNames={
            "#status":      "status",
            "#cancelledAt": "cancelledAt",
            "#updatedAt":   "updatedAt",
        },
        ExpressionAttributeValues={
            ":status":      "CANCELADA",
            ":cancelledAt": now,
            ":updatedAt":   now,
        },
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info("Activity cancelled: activityId=%s userId=%s", activity_id, user_id)
    return resp(200, updated)


def reschedule_activity(user_id: str, activity_id: str, body: dict) -> dict:
    """POST /activities/{activityId}/reschedule — move dueDate."""
    table  = get_dynamodb().Table(ACTIVITIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    item   = result.get("Item")
    if not item:
        return resp(404, {"error": "Activity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    mode = (body.get("mode") or "").strip()
    if mode not in ("+2h", "tomorrow_10am", "custom"):
        return resp(400, {"error": "mode must be one of: +2h, tomorrow_10am, custom"})

    now_utc = datetime.now(timezone.utc)

    if mode == "+2h":
        # Base is current dueDate if it is in the future, otherwise now
        raw_due = item.get("dueDate", "")
        try:
            current_due = datetime.fromisoformat(raw_due.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            current_due = now_utc
        base      = current_due if current_due > now_utc else now_utc
        new_due   = base + timedelta(hours=2)
        new_due_s = new_due.isoformat()

    elif mode == "tomorrow_10am":
        # Tomorrow at 10:00 Mexico City time (UTC-6) = 16:00 UTC
        tomorrow_mx = (now_utc + _MX_OFFSET + timedelta(days=1)).date()
        new_due     = datetime(
            tomorrow_mx.year, tomorrow_mx.month, tomorrow_mx.day,
            16, 0, 0, tzinfo=timezone.utc   # 16:00 UTC == 10:00 UTC-6
        )
        new_due_s = new_due.isoformat()

    else:  # custom
        custom_date = (body.get("customDate") or "").strip()
        if not custom_date:
            return resp(400, {"error": "customDate is required for mode=custom"})
        custom_time = (body.get("customTime") or "00:00").strip()
        try:
            # Parse as a naive datetime and treat as Mexico City local (UTC-6)
            naive_dt    = datetime.strptime(f"{custom_date} {custom_time}", "%Y-%m-%d %H:%M")
            new_due     = naive_dt.replace(tzinfo=timezone(timedelta(hours=-6)))
            new_due_s   = new_due.isoformat()
        except ValueError:
            return resp(400, {"error": "customDate must be YYYY-MM-DD and customTime HH:MM"})

    now = now_iso()

    update_expressions = [
        "#dueDate = :dueDate",
        "#updatedAt = :updatedAt",
    ]
    expr_names = {
        "#dueDate":   "dueDate",
        "#updatedAt": "updatedAt",
    }
    expr_values = {
        ":dueDate":   new_due_s,
        ":updatedAt": now,
    }

    # Keep scheduledAt in sync if it was previously set
    if item.get("scheduledAt"):
        update_expressions.append("#scheduledAt = :scheduledAt")
        expr_names["#scheduledAt"]  = "scheduledAt"
        expr_values[":scheduledAt"] = new_due_s

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "activityId": activity_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info(
        "Activity rescheduled: activityId=%s mode=%s newDueDate=%s userId=%s",
        activity_id, mode, new_due_s, user_id,
    )
    return resp(200, updated)


def delete_activity(user_id: str, activity_id: str) -> dict:
    """DELETE /activities/{activityId}."""
    table  = get_dynamodb().Table(ACTIVITIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    item   = result.get("Item")
    if not item:
        return resp(404, {"error": "Activity not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    table.delete_item(Key={"tenantId": TENANT_ID, "activityId": activity_id})
    logger.info("Activity deleted: activityId=%s userId=%s", activity_id, user_id)
    return resp(200, {"success": True, "activityId": activity_id})


# ── Main handler ──────────────────────────────────────────────────────────────

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

    # ── Auth ──────────────────────────────────────────────────────────────────
    user_id = extract_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    # ── Routing metadata ──────────────────────────────────────────────────────
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "")
    )
    path        = event.get("rawPath") or event.get("path", "")
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    # CORS pre-flight
    if method == "OPTIONS":
        return resp(200, {})

    try:
        body_str = event.get("body") or "{}"
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        return resp(400, {"error": "Invalid JSON body"})

    try:
        activity_id = path_params.get("activityId")

        # ── GET /activities/today  (must come before /{activityId} match) ─────
        if method == "GET" and path.rstrip("/") == "/activities/today":
            return get_today(user_id)

        # ── GET /activities/by-entity/{entityType}/{entityId} ─────────────────
        # Path pattern: /activities/by-entity/LEAD/some-uuid
        if method == "GET" and "/by-entity/" in path:
            # Extract entityType and entityId from the path directly since
            # API Gateway may pass them via pathParameters or we parse manually.
            by_entity_type = path_params.get("entityType")
            by_entity_id   = path_params.get("entityId")
            if not by_entity_type or not by_entity_id:
                # Fallback: parse from raw path
                # /activities/by-entity/{entityType}/{entityId}
                segments = [s for s in path.split("/") if s]
                try:
                    by_idx         = segments.index("by-entity")
                    by_entity_type = segments[by_idx + 1]
                    by_entity_id   = segments[by_idx + 2]
                except (ValueError, IndexError):
                    return resp(400, {"error": "Invalid by-entity path"})
            return get_by_entity(user_id, by_entity_type, by_entity_id)

        # ── GET /activities ───────────────────────────────────────────────────
        if method == "GET" and path.rstrip("/") == "/activities":
            return list_activities(user_id, query_params)

        # ── GET /activities/{activityId} ──────────────────────────────────────
        if method == "GET" and activity_id:
            return get_activity(user_id, activity_id)

        # ── POST /activities ──────────────────────────────────────────────────
        if method == "POST" and path.rstrip("/") == "/activities":
            return create_activity(user_id, body)

        # ── POST /activities/{activityId}/complete ────────────────────────────
        if method == "POST" and activity_id and path.endswith("/complete"):
            return complete_activity(user_id, activity_id, body)

        # ── POST /activities/{activityId}/cancel ──────────────────────────────
        if method == "POST" and activity_id and path.endswith("/cancel"):
            return cancel_activity(user_id, activity_id)

        # ── POST /activities/{activityId}/reschedule ──────────────────────────
        if method == "POST" and activity_id and path.endswith("/reschedule"):
            return reschedule_activity(user_id, activity_id, body)

        # ── PATCH /activities/{activityId} ────────────────────────────────────
        if method == "PATCH" and activity_id:
            return patch_activity(user_id, activity_id, body)

        # ── DELETE /activities/{activityId} ───────────────────────────────────
        if method == "DELETE" and activity_id:
            return delete_activity(user_id, activity_id)

        return resp(404, {"error": "Route not found"})

    except ClientError as e:
        logger.error("AWS ClientError: %s", e.response["Error"])
        return resp(500, {"error": "Internal server error"})
    except Exception:
        logger.exception("Unhandled error")
        return resp(500, {"error": "Internal server error"})
