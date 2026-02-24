"""
polizalab-policy-parse-worker (Python 3.12)
SQS trigger on PolicyParseQueue (SNS-wrapped Textract notifications).
Gets Textract results, extracts fields, updates DynamoDB.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone, date
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError
from dateutil.relativedelta import relativedelta

import extractor as field_extractor

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ──────────────────────────────────────────────────────────────
POLICIES_TABLE = os.environ.get("POLICIES_TABLE", "Policies")
TENANT_ID = os.environ.get("TENANT_ID", "default")
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.75"))
REQUIRED_FIELDS_ENV = os.environ.get("REQUIRED_FIELDS", "policyNumber,insuredName,startDate,endDate")
REQUIRED_FIELDS = [f.strip() for f in REQUIRED_FIELDS_ENV.split(",") if f.strip()]

# ── AWS clients ───────────────────────────────────────────────────────────────
_dynamodb = None
_textract = None
_s3 = None


def get_dynamodb():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    return _dynamodb


def get_textract():
    global _textract
    if _textract is None:
        _textract = boto3.client("textract", region_name="us-east-1")
    return _textract


def get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name="us-east-1")
    return _s3


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def floats_to_decimals(obj):
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: floats_to_decimals(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [floats_to_decimals(v) for v in obj]
    return obj


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


def get_all_textract_blocks(job_id: str) -> list[dict]:
    """Paginate through GetDocumentAnalysis until all blocks are collected."""
    blocks = []
    kwargs = {"JobId": job_id}
    while True:
        response = get_textract().get_document_analysis(**kwargs)
        blocks.extend(response.get("Blocks", []))
        next_token = response.get("NextToken")
        if not next_token:
            break
        kwargs["NextToken"] = next_token
    return blocks


def process_record(record: dict) -> None:
    # Unwrap SNS → SQS envelope
    body = json.loads(record["body"])
    message_str = body.get("Message", "{}")
    msg = json.loads(message_str)

    job_id = msg.get("JobId", "")
    textract_status = msg.get("Status", "")
    # JobTag is now the plain policyId UUID (36 chars).
    # Older messages may have been JSON — handle both formats.
    job_tag_raw = msg.get("JobTag", "")
    try:
        job_tag = json.loads(job_tag_raw)
        policy_id = job_tag.get("policyId", job_tag_raw)
        tenant_id = job_tag.get("tenantId", TENANT_ID)
    except (json.JSONDecodeError, AttributeError):
        job_tag = {}  # not JSON — raw string is the policyId
        policy_id = job_tag_raw
        tenant_id = TENANT_ID

    logger.info(
        "Processing Textract notification job=%s status=%s policy=%s",
        job_id, textract_status, policy_id,
    )

    if not policy_id:
        logger.error("No policyId in job tag, skipping")
        return

    table = get_dynamodb().Table(POLICIES_TABLE)
    result = table.get_item(Key={"tenantId": tenant_id, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        logger.error("Policy %s not found", policy_id)
        return

    # s3KeyTextractResult may have been in the JobTag (old) or stored in DDB (new)
    s3_key_textract_result = job_tag.get("s3KeyTextractResult") or item.get("s3KeyTextractResult", "")

    current_status = item.get("status")

    # Idempotency
    if current_status in {"EXTRACTED", "NEEDS_REVIEW", "VERIFIED"}:
        logger.info("Policy %s already in terminal status %s — skip", policy_id, current_status)
        return

    # Textract job failed
    if textract_status == "FAILED":
        error_msg = msg.get("StatusMessage", "Textract analysis failed")
        table.update_item(
            Key={"tenantId": tenant_id, "policyId": policy_id},
            UpdateExpression=(
                "SET #status = :failed, lastError = :err, "
                "processingEndedAt = :now, updatedAt = :now"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":failed": "FAILED",
                ":err": error_msg,
                ":now": now_iso(),
            },
        )
        return

    # Get all Textract blocks
    try:
        blocks = get_all_textract_blocks(job_id)
    except ClientError as e:
        logger.error("GetDocumentAnalysis failed: %s", e)
        raise  # SQS retry

    # Save raw Textract result to S3
    if s3_key_textract_result:
        s3_bucket = item.get("s3Bucket", os.environ.get("S3_BUCKET", "polizalab-documents-dev"))
        try:
            get_s3().put_object(
                Bucket=s3_bucket,
                Key=s3_key_textract_result,
                Body=json.dumps({"blocks": blocks}, default=str).encode(),
                ContentType="application/json",
            )
        except ClientError as e:
            logger.warning("Could not save Textract result to S3: %s", e)

    # Extract fields
    fields = field_extractor.extract_fields(blocks)
    field_confidence = floats_to_decimals(fields.pop("fieldConfidence", {}))
    needs_review_fields = fields.pop("needsReviewFields", [])

    # Compute renewal date
    policy_type = fields.get("policyType") or item.get("policyType")
    start_date = fields.get("startDate") or item.get("startDate")
    fecha_renovacion = calculate_renewal_date(policy_type, start_date)
    if fecha_renovacion:
        fields["fechaRenovacion"] = fecha_renovacion

    # Determine final status
    missing_required = [f for f in REQUIRED_FIELDS if not fields.get(f)]
    low_confidence = [
        f for f, c in field_confidence.items()
        if float(c) < CONFIDENCE_THRESHOLD and f in REQUIRED_FIELDS
    ]

    if missing_required or low_confidence or needs_review_fields:
        final_status = "NEEDS_REVIEW"
    else:
        final_status = "EXTRACTED"

    now = now_iso()

    # Build update expression
    update_parts = [
        "#status = :status",
        "processingEndedAt = :now",
        "updatedAt = :now",
        "fieldConfidence = :fieldConfidence",
        "needsReviewFields = :needsReviewFields",
        "extractionVersion = :extractionVersion",
    ]
    expr_names = {"#status": "status"}
    expr_values = {
        ":status": final_status,
        ":now": now,
        ":fieldConfidence": field_confidence,
        ":needsReviewFields": needs_review_fields,
        ":extractionVersion": 1,
    }

    for field_name, field_value in fields.items():
        safe_name = f"#{field_name}"
        safe_val = f":{field_name}"
        update_parts.append(f"{safe_name} = {safe_val}")
        expr_names[safe_name] = field_name
        expr_values[safe_val] = field_value

    table.update_item(
        Key={"tenantId": tenant_id, "policyId": policy_id},
        UpdateExpression="SET " + ", ".join(update_parts),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )

    logger.info("Policy %s updated to status %s", policy_id, final_status)


def handler(event: dict, context=None) -> None:
    for record in event.get("Records", []):
        try:
            process_record(record)
        except Exception as e:
            logger.exception("Failed to process record: %s", e)
            raise
