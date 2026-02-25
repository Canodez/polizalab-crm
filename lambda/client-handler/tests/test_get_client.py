"""Tests for GET /clients/{clientId}."""
import json
import os
import pytest
import boto3
from moto import mock_aws

from conftest import (
    make_event, BASE_CLIENT, BASE_POLICY, CLIENTS_TABLE_DEF, POLICIES_TABLE_DEF,
    USER_ID, OTHER_USER_ID, CLIENT_ID, POLICY_ID, TENANT_ID,
)


@pytest.fixture(autouse=True)
def reset_handler_clients():
    import handler
    handler._dynamodb = None
    yield
    handler._dynamodb = None


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
        clients_table = ddb.create_table(**CLIENTS_TABLE_DEF)
        policies_table = ddb.create_table(**POLICIES_TABLE_DEF)

        clients_table.put_item(Item={**BASE_CLIENT})
        # Other user's client
        clients_table.put_item(Item={
            **BASE_CLIENT,
            "clientId": "cli-other",
            "userId": OTHER_USER_ID,
            "email": "other@example.com",
            "phone": "+525511111111",
            "rfc": "OTHR010101ZZZ",
        })
        # Policy linked to CLIENT_ID
        policies_table.put_item(Item={
            **BASE_POLICY,
            "clientId": CLIENT_ID,
        })
        # Policy not linked to any client
        policies_table.put_item(Item={
            **BASE_POLICY,
            "policyId": "pol-unlinked",
            "createdAt": "2026-01-02T00:00:00+00:00",
            "updatedAt": "2026-01-02T00:00:00+00:00",
        })
        yield clients_table, policies_table


class TestGetClient:
    def test_returns_client_with_policies(self, setup_aws):
        import handler
        event = make_event("GET", f"/clients/{CLIENT_ID}", path_params={"clientId": CLIENT_ID})
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["clientId"] == CLIENT_ID
        assert body["firstName"] == "Juan"
        assert isinstance(body["policies"], list)
        assert any(p["policyId"] == POLICY_ID for p in body["policies"])

    def test_linked_policies_only_belong_to_this_client(self, setup_aws):
        import handler
        event = make_event("GET", f"/clients/{CLIENT_ID}", path_params={"clientId": CLIENT_ID})
        result = handler.handler(event)
        body = json.loads(result["body"])
        policy_ids = [p["policyId"] for p in body["policies"]]
        assert "pol-unlinked" not in policy_ids

    def test_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event("GET", "/clients/nonexistent", path_params={"clientId": "nonexistent"})
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_event(
            "GET", "/clients/cli-other",
            path_params={"clientId": "cli-other"},
            user_id=USER_ID,
        )
        result = handler.handler(event)
        assert result["statusCode"] == 403

    def test_response_includes_all_base_fields(self, setup_aws):
        import handler
        event = make_event("GET", f"/clients/{CLIENT_ID}", path_params={"clientId": CLIENT_ID})
        result = handler.handler(event)
        body = json.loads(result["body"])
        for field in ("clientId", "firstName", "lastName", "status", "createdAt", "updatedAt"):
            assert field in body
