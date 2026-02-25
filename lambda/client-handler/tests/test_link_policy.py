"""Tests for POST /clients/{clientId}/policies/{policyId}."""
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
        policies_table.put_item(Item={**BASE_POLICY})

        # Other user's client and policy
        clients_table.put_item(Item={
            **BASE_CLIENT,
            "clientId": "cli-other",
            "userId": OTHER_USER_ID,
            "email": "other@example.com",
            "phone": "+525511111111",
            "rfc": "OTHR010101ZZZ",
        })
        policies_table.put_item(Item={
            **BASE_POLICY,
            "policyId": "pol-other",
            "userId": OTHER_USER_ID,
            "createdAt": "2026-01-02T00:00:00+00:00",
            "updatedAt": "2026-01-02T00:00:00+00:00",
        })
        yield clients_table, policies_table


class TestLinkPolicy:
    def test_links_policy_to_client(self, setup_aws):
        import handler
        clients_table, policies_table = setup_aws
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/policies/{POLICY_ID}",
            path_params={"clientId": CLIENT_ID, "policyId": POLICY_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is True

        # Verify policy has clientId set
        policy = policies_table.get_item(
            Key={"tenantId": TENANT_ID, "policyId": POLICY_ID}
        ).get("Item")
        assert policy.get("clientId") == CLIENT_ID

    def test_increments_policy_count(self, setup_aws):
        import handler
        clients_table, policies_table = setup_aws
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/policies/{POLICY_ID}",
            path_params={"clientId": CLIENT_ID, "policyId": POLICY_ID},
        )
        handler.handler(event)

        client = clients_table.get_item(
            Key={"tenantId": TENANT_ID, "clientId": CLIENT_ID}
        ).get("Item")
        assert int(client["policyCount"]) >= 1

    def test_idempotent_when_already_linked(self, setup_aws):
        """Calling link twice for the same pair should return 200 both times."""
        import handler
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/policies/{POLICY_ID}",
            path_params={"clientId": CLIENT_ID, "policyId": POLICY_ID},
        )
        result1 = handler.handler(event)
        result2 = handler.handler(event)
        assert result1["statusCode"] == 200
        assert result2["statusCode"] == 200

    def test_client_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event(
            "POST", f"/clients/nonexistent/policies/{POLICY_ID}",
            path_params={"clientId": "nonexistent", "policyId": POLICY_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_policy_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/policies/pol-nonexistent",
            path_params={"clientId": CLIENT_ID, "policyId": "pol-nonexistent"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_client_wrong_user_returns_403(self, setup_aws):
        """User cannot link a policy to another user's client."""
        import handler
        event = make_event(
            "POST", f"/clients/cli-other/policies/{POLICY_ID}",
            path_params={"clientId": "cli-other", "policyId": POLICY_ID},
            user_id=USER_ID,
        )
        result = handler.handler(event)
        assert result["statusCode"] == 403

    def test_policy_wrong_user_returns_403(self, setup_aws):
        """User cannot link another user's policy to their client."""
        import handler
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/policies/pol-other",
            path_params={"clientId": CLIENT_ID, "policyId": "pol-other"},
            user_id=USER_ID,
        )
        result = handler.handler(event)
        assert result["statusCode"] == 403
