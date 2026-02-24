"""Shared fixtures for policy-parse-worker tests."""
import json
import os
import sys
import pytest
import boto3
from moto import mock_aws

# Add lambda root to path so handler can import claude_extractor
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("POLICIES_TABLE", "Policies")
os.environ.setdefault("TENANT_ID", "default")
os.environ.setdefault("CONFIDENCE_THRESHOLD", "0.75")
os.environ.setdefault("REQUIRED_FIELDS", "policyNumber,insuredName,startDate,endDate")
os.environ.setdefault("S3_BUCKET", "test-bucket")

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def load_fixture(name: str) -> dict:
    with open(os.path.join(FIXTURE_DIR, name)) as f:
        return json.load(f)


def make_sns_sqs_record(
    job_id: str,
    status: str,
    policy_id: str,
    tenant_id: str = "default",
    s3_key_textract: str = "policies/default/usr-1/pol-1/textract/result.json",
) -> dict:
    """Build an SQS record wrapping an SNS Textract notification."""
    job_tag = json.dumps({
        "policyId": policy_id,
        "tenantId": tenant_id,
        "userId": "usr-1",
        "s3KeyTextractResult": s3_key_textract,
    })
    sns_message = json.dumps({
        "JobId": job_id,
        "Status": status,
        "JobTag": job_tag,
        "StatusMessage": "SUCCEEDED" if status == "SUCCEEDED" else "Job failed",
    })
    sns_envelope = json.dumps({
        "Type": "Notification",
        "Message": sns_message,
    })
    return {"body": sns_envelope, "receiptHandle": "r1"}


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
