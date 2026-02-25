"""Shared fixtures for client-handler tests."""
import json
import os
import sys

# Set env vars before importing handler
os.environ.setdefault("CLIENTS_TABLE", "Clients")
os.environ.setdefault("POLICIES_TABLE", "Policies")
os.environ.setdefault("TENANT_ID", "default")
os.environ.setdefault("ALLOWED_ORIGIN", "https://app.polizalab.com")

# Ensure the handler module is importable from tests/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import boto3
import pytest
from moto import mock_aws

USER_ID = "usr-test-1"
OTHER_USER_ID = "usr-test-2"
TENANT_ID = "default"
CLIENT_ID = "cli-test-1"
POLICY_ID = "pol-test-1"


# ── DynamoDB table definitions ─────────────────────────────────────────────────

CLIENTS_TABLE_DEF = dict(
    TableName="Clients",
    AttributeDefinitions=[
        {"AttributeName": "tenantId", "AttributeType": "S"},
        {"AttributeName": "clientId", "AttributeType": "S"},
        {"AttributeName": "userId", "AttributeType": "S"},
        {"AttributeName": "createdAt", "AttributeType": "S"},
        {"AttributeName": "email", "AttributeType": "S"},
        {"AttributeName": "rfc", "AttributeType": "S"},
        {"AttributeName": "phone", "AttributeType": "S"},
    ],
    KeySchema=[
        {"AttributeName": "tenantId", "KeyType": "HASH"},
        {"AttributeName": "clientId", "KeyType": "RANGE"},
    ],
    GlobalSecondaryIndexes=[
        {
            "IndexName": "userId-createdAt-index",
            "KeySchema": [
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "createdAt", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        },
        {
            "IndexName": "email-index",
            "KeySchema": [
                {"AttributeName": "tenantId", "KeyType": "HASH"},
                {"AttributeName": "email", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        },
        {
            "IndexName": "rfc-index",
            "KeySchema": [
                {"AttributeName": "tenantId", "KeyType": "HASH"},
                {"AttributeName": "rfc", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        },
        {
            "IndexName": "phone-index",
            "KeySchema": [
                {"AttributeName": "tenantId", "KeyType": "HASH"},
                {"AttributeName": "phone", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        },
    ],
    BillingMode="PAY_PER_REQUEST",
)

POLICIES_TABLE_DEF = dict(
    TableName="Policies",
    AttributeDefinitions=[
        {"AttributeName": "tenantId", "AttributeType": "S"},
        {"AttributeName": "policyId", "AttributeType": "S"},
        {"AttributeName": "userId", "AttributeType": "S"},
        {"AttributeName": "createdAt", "AttributeType": "S"},
    ],
    KeySchema=[
        {"AttributeName": "tenantId", "KeyType": "HASH"},
        {"AttributeName": "policyId", "KeyType": "RANGE"},
    ],
    GlobalSecondaryIndexes=[
        {
            "IndexName": "userId-createdAt-index",
            "KeySchema": [
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "createdAt", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
        }
    ],
    BillingMode="PAY_PER_REQUEST",
)


# ── Event factory ──────────────────────────────────────────────────────────────

def make_event(
    method: str,
    path: str,
    body: dict | None = None,
    path_params: dict | None = None,
    query_params: dict | None = None,
    user_id: str = USER_ID,
) -> dict:
    """Build a minimal API Gateway HTTP API v2 event."""
    import base64
    payload = json.dumps({"sub": user_id}).encode()
    b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    fake_token = f"header.{b64}.sig"

    return {
        "rawPath": path,
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
        },
        "headers": {"Authorization": f"Bearer {fake_token}"},
        "pathParameters": path_params or {},
        "queryStringParameters": query_params or {},
        "body": json.dumps(body) if body is not None else None,
    }


# ── Shared seed items ──────────────────────────────────────────────────────────

BASE_CLIENT = {
    "tenantId": TENANT_ID,
    "clientId": CLIENT_ID,
    "userId": USER_ID,
    "firstName": "Juan",
    "lastName": "Perez",
    "email": "juan@example.com",
    "phone": "+525512345678",
    "rfc": "PEPJ850101XXX",
    "status": "active",
    "createdFrom": "manual",
    "policyCount": 0,
    "createdAt": "2026-01-01T00:00:00+00:00",
    "updatedAt": "2026-01-01T00:00:00+00:00",
}

BASE_POLICY = {
    "tenantId": TENANT_ID,
    "policyId": POLICY_ID,
    "userId": USER_ID,
    "createdAt": "2026-01-01T00:00:00+00:00",
    "updatedAt": "2026-01-01T00:00:00+00:00",
    "status": "EXTRACTED",
}
