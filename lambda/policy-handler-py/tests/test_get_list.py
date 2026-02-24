"""Tests for GET /policies and GET /policies/{policyId}."""
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
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-bucket")

        # Seed data
        table.put_item(Item={
            "tenantId": "default", "policyId": "pol-1", "userId": "usr-1",
            "createdByUserId": "usr-1", "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z", "status": "EXTRACTED",
            "insuredName": "Juan García", "policyNumber": "MX-001",
        })
        table.put_item(Item={
            "tenantId": "default", "policyId": "pol-2", "userId": "usr-2",
            "createdByUserId": "usr-2", "createdAt": "2026-01-02T00:00:00Z",
            "updatedAt": "2026-01-02T00:00:00Z", "status": "VERIFIED",
        })
        yield table


def make_event(method: str, path: str, path_params: dict = None, user_id: str = "usr-1") -> dict:
    import base64, json as _json
    payload = _json.dumps({"sub": user_id}).encode()
    b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return {
        "rawPath": path,
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
        },
        "headers": {},
        "pathParameters": path_params or {},
        "body": None,
    }


class TestListPolicies:
    def test_list_returns_only_user_policies(self, setup_aws):
        import handler
        event = make_event("GET", "/policies", user_id="usr-1")
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["count"] == 1
        assert body["policies"][0]["policyId"] == "pol-1"

    def test_list_returns_empty_for_user_with_no_policies(self, setup_aws):
        import handler
        event = make_event("GET", "/policies", user_id="usr-99")
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["count"] == 0

    def test_get_policy_returns_correct_item(self, setup_aws):
        import handler
        event = make_event("GET", "/policies/pol-1", path_params={"policyId": "pol-1"})
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["policyId"] == "pol-1"
        assert body["insuredName"] == "Juan García"

    def test_get_policy_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_event("GET", "/policies/pol-2", path_params={"policyId": "pol-2"}, user_id="usr-1")
        result = handler.handler(event)
        assert result["statusCode"] == 403

    def test_get_policy_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event("GET", "/policies/pol-99", path_params={"policyId": "pol-99"})
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_unauthorized_returns_401(self, setup_aws):
        import handler
        event = {
            "rawPath": "/policies",
            "requestContext": {"http": {"method": "GET", "path": "/policies"}},
            "headers": {},
            "pathParameters": {},
            "body": None,
        }
        result = handler.handler(event)
        assert result["statusCode"] == 401
