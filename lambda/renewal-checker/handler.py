"""
polizalab-renewal-checker (Python 3.12)
Scheduled Lambda (CloudWatch Events rate(1 day)).
Scans policies where endDate is ~30 days from now and creates
RENOVACION_PRIMER_CONTACTO auto-activities for each.
"""
from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timezone, timedelta, date

import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

POLICIES_TABLE = os.environ.get("POLICIES_TABLE", "Policies")
ACTIVITIES_TABLE = os.environ.get("ACTIVITIES_TABLE", "Activities")
TENANT_ID = os.environ.get("TENANT_ID", "default")

# Import shared module
try:
    from shared.auto_activity import create_auto_activity
except ImportError:
    from auto_activity import create_auto_activity

_dynamodb = None


def get_dynamodb():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    return _dynamodb


def handler(event: dict, context=None) -> dict:
    """
    Triggered daily by CloudWatch Events.
    Scans all policies and creates renewal activities for those
    expiring within 30 days that don't already have one.
    """
    logger.info("Renewal checker started")

    table = get_dynamodb().Table(POLICIES_TABLE)
    today = date.today()
    target_date = today + timedelta(days=30)
    target_str = target_date.isoformat()
    today_str = today.isoformat()

    # Scan for policies with endDate around 30 days from now
    # In production, this should use a GSI on endDate for efficiency
    scan_kwargs = {
        "FilterExpression": (
            Attr("endDate").exists()
            & Attr("endDate").lte(target_str)
            & Attr("endDate").gte(today_str)
            & Attr("status").is_in(["EXTRACTED", "VERIFIED", "NEEDS_REVIEW"])
        ),
    }

    created_count = 0
    skipped_count = 0
    error_count = 0
    last_key = None

    while True:
        if last_key:
            scan_kwargs["ExclusiveStartKey"] = last_key

        result = table.scan(**scan_kwargs)
        policies = result.get("Items", [])

        for policy in policies:
            policy_id = policy.get("policyId")
            user_id = policy.get("userId")
            end_date = policy.get("endDate", "")

            if not policy_id or not user_id:
                continue

            # Skip if already has a renewal outcome
            if policy.get("renewalOutcome"):
                skipped_count += 1
                continue

            try:
                activity = create_auto_activity(
                    activities_table=ACTIVITIES_TABLE,
                    tenant_id=policy.get("tenantId", TENANT_ID),
                    user_id=user_id,
                    tipo_codigo="RENOVACION_PRIMER_CONTACTO",
                    due_date=end_date[:10] if end_date else today_str,
                    entity_type="POLICY",
                    entity_id=policy_id,
                    notes=f"Póliza vence el {end_date[:10]}",
                )
                if activity:
                    created_count += 1
                else:
                    skipped_count += 1
            except Exception as e:
                logger.error("Error creating renewal activity for policy %s: %s", policy_id, e)
                error_count += 1

        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

    summary = {
        "created": created_count,
        "skipped": skipped_count,
        "errors": error_count,
    }
    logger.info("Renewal checker complete: %s", json.dumps(summary))
    return summary
