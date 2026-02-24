"""Tests for POST /policies/upload-url."""
import json
import os
import pytest
from moto import mock_aws
import boto3


@pytest.fixture(autouse=True)
def reset_clients():
    """Reset module-level boto3 clients between tests."""
    import handler
    handler._dynamodb = None
    handler._s3 = None
    handler._sqs = None
    yield
    handler._dynamodb = None
    handler._s3 = None
    handler._sqs = None


@pytest.fixture
def aws_env():
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@pytest.fixture
def setup_aws(aws_env):
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
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
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-bucket")
        yield


def make_event(body: dict, user_id: str = "usr-1") -> dict:
    import base64, json as _json
    payload = _json.dumps({"sub": user_id}).encode()
    b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return {
        "rawPath": "/policies/upload-url",
        "requestContext": {
            "http": {"method": "POST", "path": "/policies/upload-url"},
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
        },
        "headers": {},
        "pathParameters": {},
        "body": _json.dumps(body),
    }


class TestUploadUrl:
    def test_invalid_content_type_returns_400(self, setup_aws):
        import handler
        event = make_event({"fileName": "doc.txt", "contentType": "text/plain", "fileSizeBytes": 1000})
        result = handler.handler(event)
        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert "contentType" in body["error"].lower() or "invalid" in body["error"].lower()

    def test_file_too_large_returns_400(self, setup_aws):
        import handler
        event = make_event({
            "fileName": "big.pdf",
            "contentType": "application/pdf",
            "fileSizeBytes": 21 * 1024 * 1024,
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert "large" in body["error"].lower() or "bytes" in body["error"].lower()

    def test_valid_pdf_creates_dynamodb_record(self, setup_aws):
        import handler
        event = make_event({
            "fileName": "poliza.pdf",
            "contentType": "application/pdf",
            "fileSizeBytes": 500_000,
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert "policyId" in body
        assert "presignedPutUrl" in body
        assert body["expiresIn"] == 300

        # Verify DynamoDB record
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("Policies").get_item(
            Key={"tenantId": "default", "policyId": body["policyId"]}
        ).get("Item")
        assert item is not None
        assert item["status"] == "CREATED"
        assert item["contentType"] == "application/pdf"
        assert item["userId"] == "usr-1"

    def test_valid_png_accepted(self, setup_aws):
        import handler
        event = make_event({
            "fileName": "poliza.png",
            "contentType": "image/png",
            "fileSizeBytes": 200_000,
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200

    def test_presigned_url_returned(self, setup_aws):
        import handler
        event = make_event({
            "fileName": "doc.pdf",
            "contentType": "application/pdf",
            "fileSizeBytes": 100_000,
        })
        result = handler.handler(event)
        body = json.loads(result["body"])
        assert body["presignedPutUrl"].startswith("https://")
        assert "s3KeyOriginal" in body
