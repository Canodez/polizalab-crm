"""Shared fixtures for policy-extract-worker tests."""
import os
import pytest
import boto3
from moto import mock_aws

os.environ.setdefault("POLICIES_TABLE", "Policies")
os.environ.setdefault("SNS_TOPIC_ARN", "arn:aws:sns:us-east-1:123456789:polizalab-textract-notifications")
os.environ.setdefault("TEXTRACT_ROLE_ARN", "arn:aws:iam::123456789:role/PolizaLabTextractRole")
os.environ.setdefault("TENANT_ID", "default")
os.environ.setdefault("S3_BUCKET", "test-bucket")


@pytest.fixture
def aws_env():
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@pytest.fixture
def ddb_table(aws_env):
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


def make_sqs_record(policy_id: str, status: str = "UPLOADED") -> dict:
    import json
    return {
        "body": json.dumps({
            "tenantId": "default",
            "policyId": policy_id,
            "userId": "usr-1",
            "s3KeyOriginal": f"policies/default/usr-1/{policy_id}/original.pdf",
            "contentType": "application/pdf",
        }),
        "receiptHandle": "test-receipt-handle",
    }
