"""
polizalab-policy-handler (Python 3.12)
Replaces the TypeScript handler with composite-key DynamoDB schema.
Routes:
  GET  /policies
  GET  /policies/renewals
  GET  /policies/{policyId}
  POST /policies/upload-url
  POST /policies/{policyId}/ingest
  PATCH /policies/{policyId}
"""
from __future__ import annotations

import json
import os
import uuid
import logging
from datetime import datetime, timezone, date
from dateutil.relativedelta import relativedelta

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from botocore.config import Config

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ──────────────────────────────────────────────────────────────
POLICIES_TABLE = os.environ.get("POLICIES_TABLE", "Policies")
S3_BUCKET = os.environ.get("S3_BUCKET", "polizalab-documents-dev")
EXTRACT_QUEUE_URL = os.environ.get("EXTRACT_QUEUE_URL", "")
TENANT_ID = os.environ.get("TENANT_ID", "default")
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", str(20 * 1024 * 1024)))
PRESIGNED_EXPIRY = int(os.environ.get("PRESIGNED_EXPIRY", "300"))

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
}

# ── AWS clients ───────────────────────────────────────────────────────────────
_dynamodb = None
_s3 = None
_sqs = None


def get_dynamodb():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    return _dynamodb


def get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            region_name="us-east-1",
            config=Config(signature_version="s3v4"),
        )
    return _s3


def get_sqs():
    global _sqs
    if _sqs is None:
        _sqs = boto3.client("sqs", region_name="us-east-1")
    return _sqs


# ── Helpers ──────────────────────────────────────────────────────────────────
CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}


def resp(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
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
        token = auth_header.replace("Bearer ", "")
        import base64

        payload_b64 = token.split(".")[1]
        # Add padding if needed
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub")
    except Exception:
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def calculate_renewal_date(policy_type: str | None, start_date: str | None) -> str | None:
    if not policy_type or not start_date:
        return None
    if policy_type == "Vida permanente":
        return None
    try:
        d = date.fromisoformat(start_date[:10])
        renewal = d + relativedelta(months=12)
        return renewal.isoformat()
    except Exception:
        return None


def calculate_renewal_status(fecha_renovacion: str | None) -> str:
    if not fecha_renovacion:
        return "NOT_URGENT"
    try:
        renewal = date.fromisoformat(fecha_renovacion[:10])
        today = date.today()
        days = (renewal - today).days
        if days < 0:
            return "OVERDUE"
        if days <= 30:
            return "30_DAYS"
        if days <= 60:
            return "60_DAYS"
        if days <= 90:
            return "90_DAYS"
        return "NOT_URGENT"
    except Exception:
        return "NOT_URGENT"


def enrich_policy(p: dict) -> dict:
    """Compute fechaRenovacion + renewalStatus on-the-fly."""
    fecha = p.get("fechaRenovacion") or calculate_renewal_date(
        p.get("policyType"), p.get("startDate")
    )
    if fecha:
        p["fechaRenovacion"] = fecha
        p["renewalStatus"] = calculate_renewal_status(fecha)
    return p


# ── Route handlers ────────────────────────────────────────────────────────────

def list_policies(user_id: str) -> dict:
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.query(
        IndexName="userId-createdAt-index",
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=50,
    )
    policies = [enrich_policy(item) for item in result.get("Items", [])]
    return resp(200, {"policies": policies, "count": len(policies)})


def get_renewals(user_id: str, query_params: dict = None) -> dict:
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.query(
        IndexName="userId-createdAt-index",
        KeyConditionExpression=Key("userId").eq(user_id),
    )
    items = result.get("Items", [])
    eligible_statuses = {"EXTRACTED", "VERIFIED", "NEEDS_REVIEW"}
    window = (query_params or {}).get("window", "")

    # Determine which renewalStatus values are relevant for the window
    if window == "overdue":
        allowed_statuses = {"OVERDUE"}
    elif window == "30":
        allowed_statuses = {"30_DAYS"}
    elif window == "60":
        allowed_statuses = {"30_DAYS", "60_DAYS"}
    elif window == "90":
        allowed_statuses = {"30_DAYS", "60_DAYS", "90_DAYS"}
    else:
        allowed_statuses = {"30_DAYS", "60_DAYS", "90_DAYS", "OVERDUE"}

    policies = []
    for item in items:
        if item.get("status") not in eligible_statuses:
            continue
        # Skip policies already handled (renewed or lost)
        if item.get("renewalOutcome"):
            continue
        item = enrich_policy(item)
        if item.get("renewalStatus") in allowed_statuses:
            policies.append(item)
    policies.sort(key=lambda p: p.get("fechaRenovacion") or "")
    return resp(200, {"policies": policies, "count": len(policies)})


def mark_renewed(user_id: str, policy_id: str, body: dict) -> dict:
    """Mark a policy as renewed, optionally linking to the new policy."""
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Policy not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    new_policy_id = (body.get("newPolicyId") or "").strip() or None
    now = now_iso()

    update_expr = "SET renewalOutcome = :outcome, renewalOutcomeAt = :now, updatedAt = :now"
    expr_values = {":outcome": "RENEWED", ":now": now}

    if new_policy_id:
        update_expr += ", renewedPolicyId = :newId"
        expr_values[":newId"] = new_policy_id

    table.update_item(
        Key={"tenantId": TENANT_ID, "policyId": policy_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
    )
    logger.info("Policy marked renewed: policyId=%s newPolicyId=%s", policy_id, new_policy_id)
    return resp(200, {"success": True, "policyId": policy_id, "renewalOutcome": "RENEWED"})


def mark_renewal_lost(user_id: str, policy_id: str, body: dict) -> dict:
    """Mark a policy renewal as lost with a reason."""
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Policy not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    reason = (body.get("reason") or "").strip()
    if not reason:
        return resp(400, {"error": "reason is required"})

    valid_reasons = {"PRECIO", "COBERTURA", "COMPETENCIA", "SIN_RESPUESTA", "CAMBIO_PLANES", "OTRO"}
    if reason.upper() not in valid_reasons:
        return resp(400, {"error": f"reason must be one of: {', '.join(sorted(valid_reasons))}"})

    now = now_iso()
    table.update_item(
        Key={"tenantId": TENANT_ID, "policyId": policy_id},
        UpdateExpression="SET renewalOutcome = :outcome, renewalOutcomeAt = :now, renewalLostReason = :reason, updatedAt = :now",
        ExpressionAttributeValues={
            ":outcome": "LOST",
            ":now": now,
            ":reason": reason.upper(),
        },
    )
    logger.info("Policy renewal marked lost: policyId=%s reason=%s", policy_id, reason)
    return resp(200, {"success": True, "policyId": policy_id, "renewalOutcome": "LOST"})


def get_policy(user_id: str, policy_id: str) -> dict:
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Policy not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    item = enrich_policy(item)

    # Generate presigned GET URL for original document
    s3_key = item.get("s3KeyOriginal")
    if s3_key:
        try:
            url = get_s3().generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": s3_key},
                ExpiresIn=3600,
            )
            item["originalDocUrl"] = url
        except Exception as e:
            logger.warning("Could not generate presigned GET URL: %s", e)

    return resp(200, item)


def post_upload_url(user_id: str, body: dict) -> dict:
    content_type = body.get("contentType", "")
    file_size = int(body.get("fileSizeBytes", 0))
    file_name = body.get("fileName", "document")

    if content_type not in ALLOWED_CONTENT_TYPES:
        return resp(400, {"error": f"Invalid contentType. Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}"})
    if file_size > MAX_FILE_BYTES:
        return resp(400, {"error": f"File too large. Max {MAX_FILE_BYTES} bytes"})
    if file_size <= 0:
        return resp(400, {"error": "fileSizeBytes must be positive"})

    policy_id = str(uuid.uuid4())
    ext = file_name.rsplit(".", 1)[-1] if "." in file_name else "bin"
    s3_key = f"policies/{TENANT_ID}/{user_id}/{policy_id}/original.{ext}"

    now = now_iso()
    table = get_dynamodb().Table(POLICIES_TABLE)
    table.put_item(
        Item={
            "tenantId": TENANT_ID,
            "policyId": policy_id,
            "userId": user_id,
            "createdByUserId": user_id,
            "createdAt": now,
            "updatedAt": now,
            "status": "CREATED",
            "sourceFileName": file_name,
            "contentType": content_type,
            "fileSizeBytes": file_size,
            "s3Bucket": S3_BUCKET,
            "s3KeyOriginal": s3_key,
            "retryCount": 0,
        }
    )

    presigned_url = get_s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key, "ContentType": content_type},
        ExpiresIn=PRESIGNED_EXPIRY,
    )

    return resp(200, {
        "policyId": policy_id,
        "s3KeyOriginal": s3_key,
        "presignedPutUrl": presigned_url,
        "expiresIn": PRESIGNED_EXPIRY,
    })


def post_ingest(user_id: str, policy_id: str) -> dict:
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Policy not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    current_status = item.get("status")

    # Idempotent: already UPLOADED
    if current_status == "UPLOADED":
        return resp(200, {"policyId": policy_id, "status": "UPLOADED"})

    # Allow retry from FAILED; only CREATED and FAILED are valid starting points
    if current_status not in {"CREATED", "FAILED"}:
        return resp(409, {"error": f"Cannot ingest policy with status={current_status}"})

    update_expr = "SET #status = :uploaded, updatedAt = :now"
    expr_values = {":uploaded": "UPLOADED", ":prev": current_status, ":now": now_iso()}

    if current_status == "FAILED":
        # Reset error fields and bump retryCount on retry
        update_expr += ", retryCount = if_not_exists(retryCount, :zero) + :one, lastError = :none"
        expr_values[":zero"] = 0
        expr_values[":one"] = 1
        expr_values[":none"] = ""

    try:
        table.update_item(
            Key={"tenantId": TENANT_ID, "policyId": policy_id},
            UpdateExpression=update_expr,
            ConditionExpression="#status = :prev",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues=expr_values,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return resp(200, {"policyId": policy_id, "status": "UPLOADED"})
        raise

    # Enqueue extraction
    message = {
        "tenantId": TENANT_ID,
        "policyId": policy_id,
        "userId": user_id,
        "s3KeyOriginal": item.get("s3KeyOriginal", ""),
        "contentType": item.get("contentType", "application/pdf"),
    }
    get_sqs().send_message(
        QueueUrl=EXTRACT_QUEUE_URL,
        MessageBody=json.dumps(message),
    )

    return resp(200, {"policyId": policy_id, "status": "UPLOADED"})


def delete_policy(user_id: str, policy_id: str) -> dict:
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Policy not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    s3 = get_s3()
    bucket = item.get("s3Bucket", S3_BUCKET)
    keys_to_delete = [
        item.get("s3KeyOriginal"),
        item.get("s3KeyTextractResult"),
    ]
    # Also delete the text.txt sibling of the Textract result
    if item.get("s3KeyTextractResult"):
        import re
        keys_to_delete.append(re.sub(r"/[^/]+$", "/text.txt", item["s3KeyTextractResult"]))

    for key in keys_to_delete:
        if key:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception as e:
                logger.warning("Could not delete S3 object %s: %s", key, e)

    table.delete_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    return resp(200, {"success": True})


FORBIDDEN_PATCH_FIELDS = {
    "tenantId", "policyId", "userId", "createdByUserId",
    "s3Bucket", "s3KeyOriginal", "s3KeyTextractResult", "textractJobId",
    "createdAt",
}


def patch_policy(user_id: str, policy_id: str, body: dict) -> dict:
    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": TENANT_ID, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        return resp(404, {"error": "Policy not found"})
    if item.get("userId") != user_id:
        return resp(403, {"error": "Forbidden"})

    allowed_fields = [
        "policyNumber", "insuredName", "startDate", "endDate",
        "insurer", "policyType", "premiumTotal", "currency", "rfc",
    ]

    update_expressions = []
    expr_names: dict = {}
    expr_values: dict = {}

    for field in allowed_fields:
        if field in body:
            update_expressions.append(f"#{field} = :{field}")
            expr_names[f"#{field}"] = field
            expr_values[f":{field}"] = body[field]

    now = now_iso()
    update_expressions.append("#status = :status")
    expr_names["#status"] = "status"
    expr_values[":status"] = "VERIFIED"

    update_expressions.append("updatedAt = :now")
    expr_values[":now"] = now

    update_expressions.append("verifiedAt = :verifiedAt")
    expr_values[":verifiedAt"] = now

    update_expressions.append("verifiedByUserId = :verifiedByUserId")
    expr_values[":verifiedByUserId"] = user_id

    result = table.update_item(
        Key={"tenantId": TENANT_ID, "policyId": policy_id},
        UpdateExpression="SET " + ", ".join(update_expressions),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues="ALL_NEW",
    )
    updated = enrich_policy(result.get("Attributes", {}))
    return resp(200, updated)


# ── Main handler ──────────────────────────────────────────────────────────────

def handler(event: dict, context=None) -> dict:
    logger.info("Event: %s", json.dumps(event))

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
        # GET /policies/renewals (must be before /policies/{id})
        if method == "GET" and path == "/policies/renewals":
            return get_renewals(user_id, query_params)

        # GET /policies
        if method == "GET" and path == "/policies":
            return list_policies(user_id)

        # GET /policies/{policyId}
        if method == "GET" and path.startswith("/policies/") and path_params.get("policyId"):
            return get_policy(user_id, path_params["policyId"])

        # POST /policies/upload-url
        if method == "POST" and path == "/policies/upload-url":
            return post_upload_url(user_id, body)

        # POST /policies/{policyId}/ingest
        if method == "POST" and path_params.get("policyId") and path.endswith("/ingest"):
            return post_ingest(user_id, path_params["policyId"])

        # POST /policies/{policyId}/mark-renewed
        if method == "POST" and path_params.get("policyId") and path.endswith("/mark-renewed"):
            return mark_renewed(user_id, path_params["policyId"], body)

        # POST /policies/{policyId}/mark-renewal-lost
        if method == "POST" and path_params.get("policyId") and path.endswith("/mark-renewal-lost"):
            return mark_renewal_lost(user_id, path_params["policyId"], body)

        # PATCH /policies/{policyId}
        if method == "PATCH" and path_params.get("policyId"):
            return patch_policy(user_id, path_params["policyId"], body)

        # DELETE /policies/{policyId}
        if method == "DELETE" and path_params.get("policyId"):
            return delete_policy(user_id, path_params["policyId"])

        return resp(404, {"error": "Not found"})

    except ClientError as e:
        logger.error("AWS error: %s", e)
        return resp(500, {"error": "Internal server error", "message": str(e)})
    except Exception as e:
        logger.exception("Unhandled error")
        return resp(500, {"error": "Internal server error", "message": str(e)})
