"""Tests for POST /policies/{policyId}/ingest."""
import json
import os
import pytest
from moto import mock_aws
import boto3


@pytest.fixture(autouse=True)
def reset_clients():
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
        sqs = boto3.client("sqs", region_name="us-east-1")
        queue = sqs.create_queue(QueueName="PolicyExtractQueue")
        os.environ["EXTRACT_QUEUE_URL"] = queue["QueueUrl"]

        # Pre-seed a CREATED policy
        table.put_item(Item={
            "tenantId": "default",
            "policyId": "pol-1",
            "userId": "usr-1",
            "createdByUserId": "usr-1",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "status": "CREATED",
            "contentType": "application/pdf",
            "s3KeyOriginal": "policies/default/usr-1/pol-1/original.pdf",
            "retryCount": 0,
        })

        # Pre-seed an UPLOADED policy (for idempotency test)
        table.put_item(Item={
            "tenantId": "default",
            "policyId": "pol-uploaded",
            "userId": "usr-1",
            "createdByUserId": "usr-1",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "status": "UPLOADED",
            "contentType": "application/pdf",
            "s3KeyOriginal": "policies/default/usr-1/pol-uploaded/original.pdf",
            "retryCount": 0,
        })

        yield table, sqs, queue["QueueUrl"]


def make_ingest_event(policy_id: str, user_id: str = "usr-1") -> dict:
    import base64, json as _json
    payload = _json.dumps({"sub": user_id}).encode()
    b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return {
        "rawPath": f"/policies/{policy_id}/ingest",
        "requestContext": {
            "http": {"method": "POST", "path": f"/policies/{policy_id}/ingest"},
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
        },
        "headers": {},
        "pathParameters": {"policyId": policy_id},
        "body": "{}",
    }


class TestIngest:
    def test_created_to_uploaded_transition(self, setup_aws):
        import handler
        table, sqs, queue_url = setup_aws
        event = make_ingest_event("pol-1")
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "UPLOADED"

        # Verify DynamoDB updated
        item = table.get_item(Key={"tenantId": "default", "policyId": "pol-1"}).get("Item")
        assert item["status"] == "UPLOADED"

    def test_sqs_message_sent(self, setup_aws):
        import handler
        table, sqs, queue_url = setup_aws
        event = make_ingest_event("pol-1")
        handler.handler(event)

        messages = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=1).get("Messages", [])
        assert len(messages) == 1
        msg_body = json.loads(messages[0]["Body"])
        assert msg_body["policyId"] == "pol-1"
        assert msg_body["tenantId"] == "default"

    def test_already_uploaded_is_idempotent(self, setup_aws):
        import handler
        event = make_ingest_event("pol-uploaded")
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "UPLOADED"

    def test_not_found_returns_404(self, setup_aws):
        import handler
        event = make_ingest_event("pol-nonexistent")
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_ingest_event("pol-1", user_id="other-user")
        result = handler.handler(event)
        assert result["statusCode"] == 403
