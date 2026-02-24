"""Tests for PATCH /policies/{policyId}."""
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

        table.put_item(Item={
            "tenantId": "default", "policyId": "pol-1", "userId": "usr-1",
            "createdByUserId": "usr-1", "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z", "status": "NEEDS_REVIEW",
            "insuredName": "Old Name", "policyNumber": "OLD-001",
        })
        yield table


def make_patch_event(policy_id: str, body: dict, user_id: str = "usr-1") -> dict:
    import base64, json as _json
    payload = _json.dumps({"sub": user_id}).encode()
    b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return {
        "rawPath": f"/policies/{policy_id}",
        "requestContext": {
            "http": {"method": "PATCH", "path": f"/policies/{policy_id}"},
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
        },
        "headers": {},
        "pathParameters": {"policyId": policy_id},
        "body": _json.dumps(body),
    }


class TestPatchPolicy:
    def test_fields_updated_and_status_becomes_verified(self, setup_aws):
        import handler
        event = make_patch_event("pol-1", {
            "insuredName": "New Name",
            "policyNumber": "MX-999",
            "startDate": "2026-01-01",
            "endDate": "2027-01-01",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "VERIFIED"
        assert body["insuredName"] == "New Name"
        assert body["policyNumber"] == "MX-999"

    def test_verifiedAt_and_verifiedByUserId_set(self, setup_aws):
        import handler
        event = make_patch_event("pol-1", {"insuredName": "Test"})
        result = handler.handler(event)
        body = json.loads(result["body"])
        assert "verifiedAt" in body
        assert body["verifiedByUserId"] == "usr-1"

    def test_forbidden_fields_not_updated(self, setup_aws):
        import handler
        event = make_patch_event("pol-1", {
            "tenantId": "hacked",
            "policyId": "hacked",
            "insuredName": "Legit Name",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["tenantId"] == "default"
        assert body["policyId"] == "pol-1"

    def test_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_patch_event("pol-1", {"insuredName": "Hack"}, user_id="attacker")
        result = handler.handler(event)
        assert result["statusCode"] == 403

    def test_not_found_returns_404(self, setup_aws):
        import handler
        event = make_patch_event("pol-nonexistent", {"insuredName": "X"})
        result = handler.handler(event)
        assert result["statusCode"] == 404
