"""Shared fixtures for policy-handler-py tests."""
import json
import os
import pytest

# Set env vars before importing handler
os.environ.setdefault("POLICIES_TABLE", "Policies")
os.environ.setdefault("S3_BUCKET", "test-bucket")
os.environ.setdefault("EXTRACT_QUEUE_URL", "https://sqs.us-east-1.amazonaws.com/123456789/PolicyExtractQueue")
os.environ.setdefault("TENANT_ID", "default")
os.environ.setdefault("MAX_FILE_BYTES", str(20 * 1024 * 1024))
os.environ.setdefault("PRESIGNED_EXPIRY", "300")

import boto3
from moto import mock_aws


USER_ID = "usr-test-1"
TENANT_ID = "default"
POLICY_ID = "pol-test-1"


def make_event(
    method: str,
    path: str,
    body: dict | None = None,
    path_params: dict | None = None,
    user_id: str = USER_ID,
) -> dict:
    """Build a minimal API Gateway HTTP API v2 event."""
    import base64, json as _json

    # Build a fake JWT with the user_id as sub
    payload = _json.dumps({"sub": user_id}).encode()
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
        "body": _json.dumps(body) if body else None,
    }


@pytest.fixture(scope="function")
def aws_credentials():
    """Mocked AWS credentials for moto."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@pytest.fixture(scope="function")
def mock_table(aws_credentials):
    """Create the Policies DynamoDB table via moto."""
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.create_table(
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
        yield table


@pytest.fixture(scope="function")
def mock_s3(aws_credentials):
    """Create a test S3 bucket via moto."""
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-bucket")
        yield s3


@pytest.fixture(scope="function")
def mock_sqs(aws_credentials):
    """Create a test SQS queue via moto."""
    with mock_aws():
        sqs = boto3.client("sqs", region_name="us-east-1")
        queue = sqs.create_queue(QueueName="PolicyExtractQueue")
        os.environ["EXTRACT_QUEUE_URL"] = queue["QueueUrl"]
        yield sqs
