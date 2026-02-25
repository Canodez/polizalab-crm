"""
polizalab-client-handler (Python 3.12)
Manages the Clients entity for PolizaLab CRM.
Routes:
  GET    /clients
  GET    /clients/check-duplicate
  GET    /clients/{clientId}
  POST   /clients
  POST   /clients/upsert
  POST   /clients/{clientId}/archive
  POST   /clients/{clientId}/unarchive
  POST   /clients/{clientId}/policies/{policyId}
  PATCH  /clients/{clientId}
  DELETE /clients/{clientId}
"""
from __future__ import annotations

import json
import os
import re
import uuid
import logging
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ──────────────────────────────────────────────────────────────
CLIENTS_TABLE = os.environ.get("CLIENTS_TABLE", "Clients")
POLICIES_TABLE = os.environ.get("POLICIES_TABLE", "Policies")
TENANT_ID = os.environ.get("TENANT_ID", "default")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

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


# ── Validation ────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
_MX10_RE = re.compile(r"^\d{10}$")
_RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$")
_CURP_RE = re.compile(r"^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[A-Z]{3}[A-Z0-9]\d$")
_ZIP_RE = re.compile(r"^\d{5}$")


def validate_client_fields(body: dict, require_names: bool = True) -> tuple[dict | None, dict | None]:
    """Validate and sanitize client input fields.

    Returns (sanitized_dict, error_response) — exactly one will be None.
    """
    errors = []

    first_name = (body.get("firstName") or "").strip()
    last_name = (body.get("lastName") or "").strip()

    if require_names:
        if not first_name:
            errors.append("firstName is required")
        elif len(first_name) > 100:
            errors.append("firstName must be 100 characters or fewer")
        if not last_name:
            errors.append("lastName is required")
        elif len(last_name) > 100:
            errors.append("lastName must be 100 characters or fewer")
    else:
        if "firstName" in body and (not first_name or len(first_name) > 100):
            errors.append("firstName must be 1-100 characters")
        if "lastName" in body and (not last_name or len(last_name) > 100):
            errors.append("lastName must be 1-100 characters")

    email = None
    if "email" in body and body["email"] is not None:
        email = (body["email"] or "").strip().lower()
        if email and not _EMAIL_RE.match(email):
            errors.append("email is not a valid email address")

    phone = None
    if "phone" in body and body["phone"] is not None:
        phone = (body["phone"] or "").strip()
        if phone:
            if _MX10_RE.match(phone):
                phone = "+52" + phone
            elif not _E164_RE.match(phone):
                errors.append("phone must be E.164 format or a 10-digit Mexican number")

    rfc = None
    if "rfc" in body and body["rfc"] is not None:
        rfc = (body["rfc"] or "").strip().upper()
        if rfc and not _RFC_RE.match(rfc):
            errors.append("rfc must be 12-13 alphanumeric characters (Mexican RFC format)")

    curp = None
    if "curp" in body and body["curp"] is not None:
        curp = (body["curp"] or "").strip().upper()
        if curp and not _CURP_RE.match(curp):
            errors.append("curp must be exactly 18 characters (Mexican CURP format)")

    zip_code = None
    if "zipCode" in body and body["zipCode"] is not None:
        zip_code = (body["zipCode"] or "").strip()
        if zip_code and not _ZIP_RE.match(zip_code):
            errors.append("zipCode must be exactly 5 digits")

    sanitized: dict = {}
    if require_names or "firstName" in body:
        sanitized["firstName"] = first_name
    if require_names or "lastName" in body:
        sanitized["lastName"] = last_name
    if "email" in body:
        sanitized["email"] = email or None
    if "phone" in body:
        sanitized["phone"] = phone or None
    if "rfc" in body:
        sanitized["rfc"] = rfc or None
    if "curp" in body:
        sanitized["curp"] = curp or None
    if "zipCode" in body:
        sanitized["zipCode"] = zip_code or None

    # Free-text fields: validate max length and strip control characters
    _TEXT_LIMITS = {"address": 500, "city": 100, "state": 100, "notes": 2000}
    for field, max_len in _TEXT_LIMITS.items():
        if field in body:
            val = body[field]
            if val is not None:
                val = str(val).strip()
                # Strip control characters (keep newlines in notes)
                if field == "notes":
                    val = re.sub(r"[^\S\n]+", " ", val)  # collapse whitespace except newlines
                else:
                    val = re.sub(r"[\x00-\x1f\x7f]", "", val)  # strip all control chars
                if len(val) > max_len:
                    errors.append(f"{field} must be {max_len} characters or fewer")
                sanitized[field] = val if val else None
            else:
                sanitized[field] = None

    if errors:
        return None, resp(400, {"error": "Validation failed", "details": errors})

    return sanitized, None


# ── Duplicate detection ────────────────────────────────────────────────────────

def _check_gsi_duplicate(
    table,
    index_name: str,
    pk_field: str,
    sk_field: str,
    sk_value: str,
    exclude_client_id: str | None = None,
) -> dict | None:
    """Query a sparse GSI for a duplicate value.

    Returns the matching item or None.
    """
    result = table.query(
        IndexName=index_name,
        KeyConditionExpression=(
            Key(pk_field).eq(TENANT_ID) & Key(sk_field).eq(sk_value)
        ),
        Limit=1,
    )
    items = result.get("Items", [])
    if not items:
        return None
    item = items[0]
    if exclude_client_id and item.get("clientId") == exclude_client_id:
        return None
    return item


def check_duplicates(
    fields: dict,
    exclude_client_id: str | None = None,
) -> tuple[str, dict] | None:
    """Check email/rfc/phone against GSIs for duplicates.

    Returns (field_name, existing_item) or None if no duplicate found.
    """
    table = get_dynamodb().Table(CLIENTS_TABLE)

    checks = [
        ("email", "email-index", "tenantId", "email"),
        ("rfc", "rfc-index", "tenantId", "rfc"),
        ("phone", "phone-index", "tenantId", "phone"),
    ]

    for field_name, index_name, pk_field, sk_field in checks:
        value = fields.get(field_name)
        if not value:
            continue
        existing = _check_gsi_duplicate(
            table, index_name, pk_field, sk_field, value, exclude_client_id
        )
        if existing:
            return field_name, existing

    return None


# ── Route handlers ─────────────────────────────────────────────────────────────

def list_clients(user_id: str, query_params: dict) -> dict:
    table = get_dynamodb().Table(CLIENTS_TABLE)

    limit_raw = query_params.get("limit", "50")
    try:
        limit = min(max(int(limit_raw), 1), 100)
    except (ValueError, TypeError):
        limit = 50

    next_token = query_params.get("nextToken")
    search = (query_params.get("search") or "").strip().lower()
    status_filter = query_params.get("status")

    query_kwargs: dict = {
        "IndexName": "userId-createdAt-index",
        "KeyConditionExpression": Key("userId").eq(user_id),
        "ScanIndexForward": False,
        "Limit": limit,
    }

    filter_parts = []
    if status_filter:
        filter_parts.append(Attr("status").eq(status_filter))
    if search:
        search_filter = (
            Attr("firstName").contains(search)
            | Attr("lastName").contains(search)
            | Attr("email").contains(search)
            | Attr("phone").contains(search)
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
    clients = result.get("Items", [])

    # Strip Restricted PII fields from list responses — only expose in detail view
    PII_LIST_REDACT = {"rfc", "curp", "address", "city", "state", "zipCode", "notes"}
    clients = [{k: v for k, v in c.items() if k not in PII_LIST_REDACT} for c in clients]

    response_body: dict = {"clients": clients, "count": len(clients)}

    last_key = result.get("LastEvaluatedKey")
    if last_key:
        response_body["nextToken"] = json.dumps(last_key, default=str)

    return resp(200, response_body)


def get_client(user_id: str, client_id: str) -> dict:
    clients_table = get_dynamodb().Table(CLIENTS_TABLE)
    result = clients_table.get_item(Key={"tenantId": TENANT_ID, "clientId": client_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Client not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Fetch linked policies from Policies table
    policies = []
    try:
        policies_table = get_dynamodb().Table(POLICIES_TABLE)
        policy_result = policies_table.query(
            IndexName="userId-createdAt-index",
            KeyConditionExpression=Key("userId").eq(user_id),
            FilterExpression=Attr("clientId").eq(client_id),
        )
        policies = policy_result.get("Items", [])
    except Exception as exc:
        logger.warning("Could not fetch policies for client %s: %s", client_id, exc)

    item["policies"] = policies
    return resp(200, item)


def create_client(user_id: str, body: dict) -> dict:
    sanitized, error = validate_client_fields(body, require_names=True)
    if error:
        return error

    # Duplicate check
    dup = check_duplicates(sanitized)
    if dup:
        dup_field, existing = dup
        return resp(409, {
            "error": "Duplicate",
            "field": dup_field,
            "existingClientId": existing.get("clientId"),
        })

    now = now_iso()
    client_id = str(uuid.uuid4())

    item: dict = {
        "tenantId": TENANT_ID,
        "clientId": client_id,
        "userId": user_id,
        "firstName": sanitized["firstName"],
        "lastName": sanitized["lastName"],
        "rfc": sanitized.get("rfc"),
        "curp": sanitized.get("curp"),
        "email": sanitized.get("email"),
        "phone": sanitized.get("phone"),
        "address": sanitized.get("address"),
        "city": sanitized.get("city"),
        "state": sanitized.get("state"),
        "zipCode": sanitized.get("zipCode"),
        "notes": sanitized.get("notes"),
        "status": "active",
        "createdFrom": "manual",
        "sourcePolicyId": None,
        "policyCount": 0,
        "createdAt": now,
        "updatedAt": now,
    }
    # Remove None values from sparse GSI fields so they are not indexed
    for sparse_field in ("rfc", "curp", "email", "phone", "address", "city", "state", "zipCode", "notes", "sourcePolicyId"):
        if item.get(sparse_field) is None:
            del item[sparse_field]

    table = get_dynamodb().Table(CLIENTS_TABLE)
    table.put_item(Item=item)

    logger.info("Client created: clientId=%s userId=%s", client_id, user_id)
    return resp(201, item)


def upsert_client(user_id: str, body: dict) -> dict:
    """Create or link a client from policy extraction.

    Idempotent: repeated calls with the same sourcePolicyId return the
    existing client without modification.
    """
    sanitized, error = validate_client_fields(body, require_names=True)
    if error:
        return error

    source_policy_id = body.get("sourcePolicyId")

    # Idempotency: if this sourcePolicyId already created a client, return it.
    # NOTE: Do not pass Limit here — DynamoDB applies Limit before the
    # FilterExpression, so a Limit=1 would scan only 1 item and may miss
    # the matching record if it falls beyond that page boundary.
    if source_policy_id:
        table = get_dynamodb().Table(CLIENTS_TABLE)
        existing_by_source = table.query(
            IndexName="userId-createdAt-index",
            KeyConditionExpression=Key("userId").eq(user_id),
            FilterExpression=Attr("sourcePolicyId").eq(source_policy_id),
        )
        existing_items = existing_by_source.get("Items", [])
        if existing_items:
            existing = existing_items[0]
            logger.info(
                "Upsert idempotent hit: clientId=%s sourcePolicyId=%s",
                existing.get("clientId"), source_policy_id,
            )
            return resp(200, {
                "client": existing,
                "created": False,
                "matched": {
                    "field": "sourcePolicyId",
                    "existingClientId": existing.get("clientId"),
                },
            })

    # Duplicate detection on email/rfc/phone
    dup = check_duplicates(sanitized)
    if dup:
        dup_field, existing = dup
        existing_client_id = existing.get("clientId")

        # Link the policy to the existing client if sourcePolicyId provided
        if source_policy_id:
            _link_policy_to_client(user_id, existing_client_id, source_policy_id)

        logger.info(
            "Upsert matched existing client: clientId=%s field=%s",
            existing_client_id, dup_field,
        )
        return resp(200, {
            "client": existing,
            "created": False,
            "matched": {
                "field": dup_field,
                "existingClientId": existing_client_id,
            },
        })

    # No match — create new client
    now = now_iso()
    client_id = str(uuid.uuid4())

    item: dict = {
        "tenantId": TENANT_ID,
        "clientId": client_id,
        "userId": user_id,
        "firstName": sanitized["firstName"],
        "lastName": sanitized["lastName"],
        "rfc": sanitized.get("rfc"),
        "curp": sanitized.get("curp"),
        "email": sanitized.get("email"),
        "phone": sanitized.get("phone"),
        "address": sanitized.get("address"),
        "city": sanitized.get("city"),
        "state": sanitized.get("state"),
        "zipCode": sanitized.get("zipCode"),
        "notes": sanitized.get("notes"),
        "status": "active",
        "createdFrom": "policy_extraction",
        "sourcePolicyId": source_policy_id,
        "policyCount": 1 if source_policy_id else 0,
        "createdAt": now,
        "updatedAt": now,
    }
    # Remove None sparse fields
    for sparse_field in ("rfc", "curp", "email", "phone", "address", "city", "state", "zipCode", "notes"):
        if item.get(sparse_field) is None:
            del item[sparse_field]
    if item.get("sourcePolicyId") is None:
        del item["sourcePolicyId"]

    table = get_dynamodb().Table(CLIENTS_TABLE)
    table.put_item(Item=item)

    # Link the source policy to this new client
    if source_policy_id:
        _link_policy_to_client(user_id, client_id, source_policy_id)

    logger.info(
        "Client created via upsert: clientId=%s userId=%s sourcePolicyId=%s",
        client_id, user_id, source_policy_id,
    )
    return resp(201, {"client": item, "created": True})


def patch_client(user_id: str, client_id: str, body: dict) -> dict:
    table = get_dynamodb().Table(CLIENTS_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "clientId": client_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Client not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    allowed_patch_fields = {
        "firstName", "lastName", "rfc", "curp", "email", "phone",
        "address", "city", "state", "zipCode", "notes",
    }
    patch_body = {k: v for k, v in body.items() if k in allowed_patch_fields}
    if not patch_body:
        return resp(400, {"error": "No updatable fields provided"})

    sanitized, error = validate_client_fields(patch_body, require_names=False)
    if error:
        return error

    # Re-check duplicates for changed unique fields, excluding this client
    dup_check_fields: dict = {}
    for field in ("email", "rfc", "phone"):
        if field in sanitized and sanitized[field] != item.get(field):
            dup_check_fields[field] = sanitized[field]

    if dup_check_fields:
        dup = check_duplicates(dup_check_fields, exclude_client_id=client_id)
        if dup:
            dup_field, existing = dup
            return resp(409, {
                "error": "Duplicate",
                "field": dup_field,
                "existingClientId": existing.get("clientId"),
            })

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
        Key={"tenantId": TENANT_ID, "clientId": client_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = result.get("Attributes", {})
    logger.info("Client updated: clientId=%s userId=%s", client_id, user_id)
    return resp(200, updated)


def archive_client(user_id: str, client_id: str) -> dict:
    return _set_client_status(user_id, client_id, "archived")


def unarchive_client(user_id: str, client_id: str) -> dict:
    return _set_client_status(user_id, client_id, "active")


def _set_client_status(user_id: str, client_id: str, status: str) -> dict:
    table = get_dynamodb().Table(CLIENTS_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "clientId": client_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Client not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    now = now_iso()
    table.update_item(
        Key={"tenantId": TENANT_ID, "clientId": client_id},
        UpdateExpression="SET #status = :status, updatedAt = :now",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={":status": status, ":now": now},
    )
    logger.info("Client status set to %s: clientId=%s userId=%s", status, client_id, user_id)
    return resp(200, {"success": True, "clientId": client_id, "status": status})


def delete_client(user_id: str, client_id: str) -> dict:
    """Permanently delete a client. Linked policies are NOT deleted but their
    clientId is removed and status is reset to NEEDS_REVIEW."""
    clients_table = get_dynamodb().Table(CLIENTS_TABLE)
    result = clients_table.get_item(Key={"tenantId": TENANT_ID, "clientId": client_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Client not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Find all policies linked to this client and unlink them
    now = now_iso()
    try:
        policies_table = get_dynamodb().Table(POLICIES_TABLE)
        policy_result = policies_table.query(
            IndexName="userId-createdAt-index",
            KeyConditionExpression=Key("userId").eq(user_id),
            FilterExpression=Attr("clientId").eq(client_id),
        )
        linked_policies = policy_result.get("Items", [])

        for policy in linked_policies:
            pid = policy.get("policyId")
            if not pid:
                continue
            policies_table.update_item(
                Key={"tenantId": TENANT_ID, "policyId": pid},
                UpdateExpression="REMOVE clientId SET #status = :pending, updatedAt = :now",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":pending": "NEEDS_REVIEW", ":now": now},
            )
            logger.info("Unlinked policy %s from deleted client %s, status reset to NEEDS_REVIEW", pid, client_id)
    except Exception as exc:
        logger.error("Error unlinking policies from client %s: %s", client_id, exc)
        return resp(500, {"error": "Internal server error"})

    # Delete the client record
    clients_table.delete_item(Key={"tenantId": TENANT_ID, "clientId": client_id})
    logger.info("Client deleted: clientId=%s userId=%s, %d policies unlinked", client_id, user_id, len(linked_policies))
    return resp(200, {"success": True, "clientId": client_id, "policiesUnlinked": len(linked_policies)})


def check_duplicate(user_id: str, query_params: dict) -> dict:
    """Check email/rfc/phone for duplicates via GSI queries.

    Only returns minimal info. Names are only disclosed if the matched
    client belongs to the requesting user (prevents cross-user enumeration).
    """
    fields_to_check: dict = {}

    email = (query_params.get("email") or "").strip().lower()
    rfc = (query_params.get("rfc") or "").strip().upper()
    phone = (query_params.get("phone") or "").strip()

    if email:
        fields_to_check["email"] = email
    if rfc:
        fields_to_check["rfc"] = rfc
    if phone:
        if _MX10_RE.match(phone):
            phone = "+52" + phone
        fields_to_check["phone"] = phone

    if not fields_to_check:
        return resp(400, {"error": "Provide at least one of: email, rfc, phone"})

    dup = check_duplicates(fields_to_check)
    if dup:
        dup_field, existing = dup
        # Only reveal client name if it belongs to the same user
        is_own = existing.get("userId") == user_id
        result_client: dict = {
            "clientId": existing.get("clientId"),
            "field": dup_field,
        }
        if is_own:
            result_client["firstName"] = existing.get("firstName")
            result_client["lastName"] = existing.get("lastName")
        return resp(200, {
            "isDuplicate": True,
            "existingClient": result_client,
        })

    return resp(200, {"isDuplicate": False})


def link_policy(user_id: str, client_id: str, policy_id: str) -> dict:
    clients_table = get_dynamodb().Table(CLIENTS_TABLE)
    client_result = clients_table.get_item(Key={"tenantId": TENANT_ID, "clientId": client_id})
    client = client_result.get("Item")
    if not client:
        return resp(404, {"error": "Client not found"})
    if client.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    policies_table = get_dynamodb().Table(POLICIES_TABLE)
    policy_result = policies_table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    policy = policy_result.get("Item")
    if not policy:
        return resp(404, {"error": "Policy not found"})
    if policy.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    # Idempotent: already linked
    if policy.get("clientId") == client_id:
        return resp(200, {"success": True})

    _link_policy_to_client(user_id, client_id, policy_id)
    logger.info(
        "Policy linked to client: policyId=%s clientId=%s userId=%s",
        policy_id, client_id, user_id,
    )
    return resp(200, {"success": True})


def _link_policy_to_client(user_id: str, client_id: str, policy_id: str) -> None:
    """Set clientId on the Policy item and atomically increment policyCount on Client."""
    now = now_iso()
    policies_table = get_dynamodb().Table(POLICIES_TABLE)
    try:
        policies_table.update_item(
            Key={"tenantId": TENANT_ID, "policyId": policy_id},
            UpdateExpression="SET clientId = :cid, updatedAt = :now",
            ExpressionAttributeValues={":cid": client_id, ":now": now},
        )
    except Exception as exc:
        logger.error(
            "Failed to set clientId on policy %s: %s", policy_id, exc
        )
        raise

    clients_table = get_dynamodb().Table(CLIENTS_TABLE)
    try:
        clients_table.update_item(
            Key={"tenantId": TENANT_ID, "clientId": client_id},
            UpdateExpression=(
                "SET policyCount = if_not_exists(policyCount, :zero) + :one, "
                "updatedAt = :now"
            ),
            ExpressionAttributeValues={":zero": 0, ":one": 1, ":now": now},
        )
    except Exception as exc:
        logger.error(
            "Failed to increment policyCount on client %s: %s", client_id, exc
        )
        raise


# ── Main handler ──────────────────────────────────────────────────────────────

def _safe_log_event(event: dict) -> dict:
    """Return a redacted copy of the event safe for CloudWatch logging.

    Strips: Authorization header (JWT token), request body (may contain PII).
    """
    safe = {
        "httpMethod": (
            event.get("requestContext", {}).get("http", {}).get("method")
            or event.get("httpMethod", "")
        ),
        "path": event.get("rawPath") or event.get("path", ""),
        "pathParameters": event.get("pathParameters"),
        "queryStringParameters": {
            k: v for k, v in (event.get("queryStringParameters") or {}).items()
            if k not in ("email", "rfc", "phone")
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
        client_id = path_params.get("clientId")
        policy_id = path_params.get("policyId")

        # ── GET /clients/check-duplicate  (must come before /{clientId})
        if method == "GET" and path == "/clients/check-duplicate":
            return check_duplicate(user_id, query_params)

        # ── GET /clients
        if method == "GET" and path == "/clients":
            return list_clients(user_id, query_params)

        # ── GET /clients/{clientId}
        if method == "GET" and path.startswith("/clients/") and client_id and not policy_id:
            return get_client(user_id, client_id)

        # ── POST /clients/upsert  (must come before /clients)
        if method == "POST" and path == "/clients/upsert":
            return upsert_client(user_id, body)

        # ── POST /clients
        if method == "POST" and path == "/clients":
            return create_client(user_id, body)

        # ── POST /clients/{clientId}/archive
        if method == "POST" and client_id and path.endswith("/archive"):
            return archive_client(user_id, client_id)

        # ── POST /clients/{clientId}/unarchive
        if method == "POST" and client_id and path.endswith("/unarchive"):
            return unarchive_client(user_id, client_id)

        # ── POST /clients/{clientId}/policies/{policyId}
        if method == "POST" and client_id and policy_id:
            return link_policy(user_id, client_id, policy_id)

        # ── PATCH /clients/{clientId}
        if method == "PATCH" and client_id:
            return patch_client(user_id, client_id, body)

        # ── DELETE /clients/{clientId}
        if method == "DELETE" and client_id and not policy_id:
            return delete_client(user_id, client_id)

        return resp(404, {"error": "Not found"})

    except ClientError as e:
        logger.error("AWS ClientError: %s", e.response["Error"])
        return resp(500, {"error": "Internal server error"})
    except Exception:
        logger.exception("Unhandled error")
        return resp(500, {"error": "Internal server error"})
