"""
polizalab-activity-type-handler (Python 3.12)
Manages the Activity Types catalog for PolizaLab CRM.

Two-table design:
  SYSTEM_TABLE  — immutable system-defined types (partitionKey="SYSTEM", SK=code)
  TENANT_TABLE  — per-tenant overrides (PK=tenantId, SK=code)

Routes:
  GET    /activity-types           — merged system + tenant list
  PATCH  /activity-types/{code}    — create/update tenant override
  POST   /activity-types/reorder   — batch-update sortOrder for multiple codes
"""
from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ───────────────────────────────────────────────────────────────
SYSTEM_TABLE  = os.environ.get("SYSTEM_TABLE",  "ActivityTypesSystem")
TENANT_TABLE  = os.environ.get("TENANT_TABLE",  "ActivityTypesTenant")
TENANT_ID     = os.environ.get("TENANT_ID",     "default")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

# ── AWS client ────────────────────────────────────────────────────────────────
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


# ── Route handlers ────────────────────────────────────────────────────────────

def list_activity_types(user_id: str, tenant_id: str) -> dict:
    """
    GET /activity-types

    1. Fetch all system types (partitionKey = "SYSTEM").
    2. Fetch all tenant overrides for this tenant.
    3. Merge: tenant values win for label, isActive, isFavorite, sortOrder.
    4. Filter out isActive=False items (tenant explicitly disabled them).
    5. Sort ascending by sortOrder.
    """
    ddb = get_dynamodb()

    # 1. Load system types
    system_result = ddb.Table(SYSTEM_TABLE).query(
        KeyConditionExpression=Key("partitionKey").eq("SYSTEM")
    )
    system_items = system_result.get("Items", [])

    # Build a lookup: code -> system item
    system_map: dict[str, dict] = {item["code"]: item for item in system_items}

    # 2. Load tenant overrides
    tenant_result = ddb.Table(TENANT_TABLE).query(
        KeyConditionExpression=Key("tenantId").eq(tenant_id)
    )
    tenant_items = tenant_result.get("Items", [])

    # Build a lookup: code -> tenant override
    tenant_map: dict[str, dict] = {item["code"]: item for item in tenant_items}

    # 3. Merge
    merged: list[dict] = []
    for code, sys_item in system_map.items():
        override = tenant_map.get(code)

        # Tenant values win when present
        label       = override.get("label",      sys_item.get("label", code))       if override else sys_item.get("label", code)
        is_active   = override.get("isActive",   sys_item.get("isActive", True))    if override else sys_item.get("isActive", True)
        is_favorite = override.get("isFavorite", sys_item.get("isFavoriteDefault", False)) if override else sys_item.get("isFavoriteDefault", False)
        sort_order  = override.get("sortOrder",  sys_item.get("sortOrder", 999))    if override else sys_item.get("sortOrder", 999)

        # 4. Skip items the tenant explicitly disabled
        if not is_active:
            continue

        merged.append({
            "code":        code,
            "label":       label,
            "sortOrder":   int(sort_order),
            "isFavorite":  bool(is_favorite),
            "isActive":    bool(is_active),
            "isSystem":    True,
            "hasOverride": override is not None,
        })

    # 5. Sort ascending by sortOrder
    merged.sort(key=lambda x: x["sortOrder"])

    logger.info(
        "list_activity_types: userId=%s tenant=%s returned=%d",
        user_id, tenant_id, len(merged),
    )
    return resp(200, {"activityTypes": merged, "count": len(merged)})


def patch_activity_type(user_id: str, tenant_id: str, code: str, body: dict) -> dict:
    """
    PATCH /activity-types/{code}

    Validates that code exists in the system table, then creates or updates
    a tenant override with the allowed fields.
    """
    ddb = get_dynamodb()

    # 1. Confirm code exists in system table
    system_result = ddb.Table(SYSTEM_TABLE).get_item(
        Key={"partitionKey": "SYSTEM", "code": code}
    )
    sys_item = system_result.get("Item")
    if not sys_item:
        return resp(404, {"error": f"Activity type '{code}' not found"})

    # 2. Collect allowed patch fields
    ALLOWED_PATCH_FIELDS = {"label", "isActive", "isFavorite", "sortOrder"}
    patch_fields = {k: v for k, v in body.items() if k in ALLOWED_PATCH_FIELDS}

    if not patch_fields:
        return resp(400, {"error": "No updatable fields provided. Allowed: label, isActive, isFavorite, sortOrder"})

    # Field-level validation
    errors = []

    if "label" in patch_fields:
        label = str(patch_fields["label"]).strip()
        if not label:
            errors.append("label must not be empty")
        elif len(label) > 100:
            errors.append("label must be 100 characters or fewer")
        patch_fields["label"] = label

    if "isActive" in patch_fields:
        if not isinstance(patch_fields["isActive"], bool):
            errors.append("isActive must be a boolean")

    if "isFavorite" in patch_fields:
        if not isinstance(patch_fields["isFavorite"], bool):
            errors.append("isFavorite must be a boolean")

    if "sortOrder" in patch_fields:
        try:
            sort_order = int(patch_fields["sortOrder"])
            if sort_order < 0 or sort_order > 9999:
                errors.append("sortOrder must be between 0 and 9999")
            patch_fields["sortOrder"] = sort_order
        except (ValueError, TypeError):
            errors.append("sortOrder must be an integer")

    if errors:
        return resp(400, {"error": "Validation failed", "details": errors})

    # 3. Build UpdateExpression
    now = now_iso()
    update_expressions = []
    expr_names: dict = {}
    expr_values: dict = {}

    for field, value in patch_fields.items():
        update_expressions.append(f"#{field} = :{field}")
        expr_names[f"#{field}"] = field
        expr_values[f":{field}"] = value

    update_expressions.append("updatedAt = :updatedAt")
    expr_values[":updatedAt"] = now

    # 4. Create/update tenant override
    ddb.Table(TENANT_TABLE).update_item(
        Key={"tenantId": tenant_id, "code": code},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )

    # 5. Fetch the freshly written override to return a merged view
    updated_override_result = ddb.Table(TENANT_TABLE).get_item(
        Key={"tenantId": tenant_id, "code": code}
    )
    override = updated_override_result.get("Item", {})

    merged_item = {
        "code":        code,
        "label":       override.get("label",      sys_item.get("label", code)),
        "sortOrder":   int(override.get("sortOrder",  sys_item.get("sortOrder", 999))),
        "isFavorite":  bool(override.get("isFavorite", sys_item.get("isFavoriteDefault", False))),
        "isActive":    bool(override.get("isActive",   sys_item.get("isActive", True))),
        "isSystem":    True,
        "hasOverride": True,
    }

    logger.info(
        "patch_activity_type: userId=%s tenant=%s code=%s fields=%s",
        user_id, tenant_id, code, list(patch_fields.keys()),
    )
    return resp(200, {"activityType": merged_item})


def reorder_activity_types(user_id: str, tenant_id: str, body: dict) -> dict:
    """
    POST /activity-types/reorder

    Accepts {items: [{code, sortOrder}, ...]} and bulk-updates sortOrder
    in the tenant override table. At most 20 items per request.
    """
    items = body.get("items")

    # Validate shape
    if not isinstance(items, list):
        return resp(400, {"error": "'items' must be an array"})

    if len(items) == 0:
        return resp(400, {"error": "'items' must contain at least one entry"})

    if len(items) > 20:
        return resp(400, {"error": "'items' must contain at most 20 entries"})

    # Validate each entry
    errors = []
    validated: list[dict] = []
    for idx, entry in enumerate(items):
        if not isinstance(entry, dict):
            errors.append(f"items[{idx}]: must be an object with 'code' and 'sortOrder'")
            continue

        code = entry.get("code")
        sort_order_raw = entry.get("sortOrder")

        if not code or not isinstance(code, str):
            errors.append(f"items[{idx}]: 'code' must be a non-empty string")
            continue

        try:
            sort_order = int(sort_order_raw)
            if sort_order < 0 or sort_order > 9999:
                errors.append(f"items[{idx}]: 'sortOrder' must be between 0 and 9999")
                continue
        except (ValueError, TypeError):
            errors.append(f"items[{idx}]: 'sortOrder' must be an integer")
            continue

        validated.append({"code": code.strip(), "sortOrder": sort_order})

    if errors:
        return resp(400, {"error": "Validation failed", "details": errors})

    now = now_iso()
    table = get_dynamodb().Table(TENANT_TABLE)
    updated_count = 0

    for entry in validated:
        table.update_item(
            Key={"tenantId": tenant_id, "code": entry["code"]},
            UpdateExpression="SET sortOrder = :so, updatedAt = :now",
            ExpressionAttributeValues={
                ":so":  entry["sortOrder"],
                ":now": now,
            },
        )
        updated_count += 1

    logger.info(
        "reorder_activity_types: userId=%s tenant=%s updated=%d",
        user_id, tenant_id, updated_count,
    )
    return resp(200, {"success": True, "updated": updated_count})


# ── Safe event logging ────────────────────────────────────────────────────────

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


# ── Main handler ──────────────────────────────────────────────────────────────

def handler(event: dict, context=None) -> dict:
    logger.info("Request: %s", json.dumps(_safe_log_event(event)))

    user_id = extract_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    # In MVP, tenantId == userId (same as Leads/Clients modules)
    tenant_id = user_id

    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "")
    )
    path        = event.get("rawPath") or event.get("path", "")
    path_params = event.get("pathParameters") or {}

    try:
        body_str = event.get("body") or "{}"
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        return resp(400, {"error": "Invalid JSON body"})

    try:
        code = path_params.get("code")

        # ── OPTIONS (CORS preflight)
        if method == "OPTIONS":
            return resp(200, {})

        # ── GET /activity-types
        if method == "GET" and path == "/activity-types":
            return list_activity_types(user_id, tenant_id)

        # ── POST /activity-types/reorder
        # Must be evaluated before the generic PATCH /{code} branch
        if method == "POST" and path == "/activity-types/reorder":
            return reorder_activity_types(user_id, tenant_id, body)

        # ── PATCH /activity-types/{code}
        if method == "PATCH" and code:
            return patch_activity_type(user_id, tenant_id, code, body)

        return resp(404, {"error": "Not found"})

    except ClientError as e:
        logger.error("AWS ClientError: %s", e.response["Error"])
        return resp(500, {"error": "Internal server error"})
    except Exception:
        logger.exception("Unhandled error")
        return resp(500, {"error": "Internal server error"})
