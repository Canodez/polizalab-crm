"""
polizalab-policy-extract-worker (Python 3.12)
SQS trigger on PolicyExtractQueue.
Starts an async Textract job and transitions the policy UPLOADED → PROCESSING.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ── Environment ──────────────────────────────────────────────────────────────
POLICIES_TABLE = os.environ.get("POLICIES_TABLE", "Policies")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")
TEXTRACT_ROLE_ARN = os.environ.get("TEXTRACT_ROLE_ARN", "")
TENANT_ID = os.environ.get("TENANT_ID", "default")

# ── AWS clients ───────────────────────────────────────────────────────────────
_dynamodb = None
_textract = None


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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def process_record(record: dict) -> None:
    body = json.loads(record["body"])
    policy_id = body["policyId"]
    tenant_id = body.get("tenantId", TENANT_ID)
    user_id = body.get("userId", "")
    s3_key_original = body["s3KeyOriginal"]
    content_type = body.get("contentType", "application/pdf")

    logger.info("Processing policy %s", policy_id)

    table = get_dynamodb().Table(POLICIES_TABLE)

    # Get current item
    result = table.get_item(Key={"tenantId": tenant_id, "policyId": policy_id})
    item = result.get("Item")
    if not item:
        logger.error("Policy %s not found", policy_id)
        return

    current_status = item.get("status")

    # Idempotency: skip terminal states and PROCESSING only if a real Textract job is running
    if current_status in {"EXTRACTED", "NEEDS_REVIEW", "VERIFIED"}:
        logger.info("Policy %s already in terminal status %s — skipping", policy_id, current_status)
        return
    if current_status == "PROCESSING" and item.get("textractJobId"):
        logger.info("Policy %s PROCESSING with active job %s — skipping", policy_id, item["textractJobId"])
        return

    if current_status not in {"UPLOADED", "PROCESSING"}:
        logger.warning("Unexpected status %s for policy %s", current_status, policy_id)
        return

    # Transition UPLOADED → PROCESSING (conditional to prevent duplicates)
    # Allow PROCESSING→PROCESSING in case we're retrying after a failed Textract start
    if current_status == "UPLOADED":
        try:
            table.update_item(
                Key={"tenantId": tenant_id, "policyId": policy_id},
                UpdateExpression="SET #status = :processing, updatedAt = :now",
                ConditionExpression="#status = :uploaded",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":processing": "PROCESSING",
                    ":uploaded": "UPLOADED",
                    ":now": now_iso(),
                },
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                logger.info("Policy %s already transitioned — skipping", policy_id)
                return
            raise

    # Determine S3 bucket from item or env
    s3_bucket = item.get("s3Bucket", os.environ.get("S3_BUCKET", "polizalab-documents-dev"))

    # Determine Textract document type
    if content_type in ("image/png", "image/jpeg"):
        document_source = {
            "S3Object": {"Bucket": s3_bucket, "Name": s3_key_original}
        }
    else:
        document_source = {
            "S3Object": {"Bucket": s3_bucket, "Name": s3_key_original}
        }

    # Compute S3 key for Textract result
    parts = s3_key_original.rsplit("/", 1)
    key_prefix = parts[0] if len(parts) > 1 else s3_key_original
    s3_key_textract_result = f"{key_prefix}/textract/result.json"

    # Textract JobTag max is 64 chars. Pass only the policyId (36 chars UUID).
    # The parse-worker reads tenantId from the env var (always "default").
    job_tag = policy_id

    retry_count = int(item.get("retryCount", 0))

    try:
        textract_response = get_textract().start_document_analysis(
            DocumentLocation=document_source,
            FeatureTypes=["FORMS", "TABLES"],
            NotificationChannel={
                "SNSTopicArn": SNS_TOPIC_ARN,
                "RoleArn": TEXTRACT_ROLE_ARN,
            },
            JobTag=job_tag,
        )
        job_id = textract_response["JobId"]
        logger.info("Started Textract job %s for policy %s", job_id, policy_id)

        table.update_item(
            Key={"tenantId": tenant_id, "policyId": policy_id},
            UpdateExpression=(
                "SET textractJobId = :jobId, "
                "processingStartedAt = :now, "
                "s3KeyTextractResult = :s3Key, "
                "updatedAt = :now"
            ),
            ExpressionAttributeValues={
                ":jobId": job_id,
                ":now": now_iso(),
                ":s3Key": s3_key_textract_result,
            },
        )

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        logger.error("Textract start failed (%s): %s", error_code, e)

        # InvalidParameterException is a programming error — fail immediately, no retry
        permanent_errors = {"InvalidParameterException", "InvalidS3ObjectException",
                            "UnsupportedDocumentException", "BadDocumentException"}

        if error_code in permanent_errors or retry_count >= 3:
            table.update_item(
                Key={"tenantId": tenant_id, "policyId": policy_id},
                UpdateExpression=(
                    "SET #status = :failed, lastError = :err, updatedAt = :now"
                ),
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":failed": "FAILED",
                    ":err": f"{error_code}: {e.response['Error'].get('Message', str(e))}",
                    ":now": now_iso(),
                },
            )
            return  # don't raise — let SQS delete the message

        # Transient error: reset to UPLOADED so next SQS retry can attempt again
        table.update_item(
            Key={"tenantId": tenant_id, "policyId": policy_id},
            UpdateExpression="SET #status = :uploaded, retryCount = retryCount + :one, updatedAt = :now",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":uploaded": "UPLOADED",
                ":one": 1,
                ":now": now_iso(),
            },
        )
        raise  # SQS will retry; status is UPLOADED so retry won't be skipped


def handler(event: dict, context=None) -> None:
    for record in event.get("Records", []):
        try:
            process_record(record)
        except Exception as e:
            logger.exception("Failed to process record: %s", e)
            raise
