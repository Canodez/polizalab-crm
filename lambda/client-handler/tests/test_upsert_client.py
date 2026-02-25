"""Tests for POST /clients/upsert."""
import json
import os
import pytest
import boto3
from moto import mock_aws

from conftest import (
    make_event, BASE_CLIENT, CLIENTS_TABLE_DEF, POLICIES_TABLE_DEF,
    USER_ID, CLIENT_ID, POLICY_ID, TENANT_ID,
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
        policies_table.put_item(Item={
            "tenantId": TENANT_ID,
            "policyId": POLICY_ID,
            "userId": USER_ID,
            "createdAt": "2026-01-01T00:00:00+00:00",
            "updatedAt": "2026-01-01T00:00:00+00:00",
            "status": "EXTRACTED",
        })
        yield clients_table, policies_table


class TestUpsertClient:
    def test_creates_new_client_when_no_duplicate(self, setup_aws):
        import handler
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Nuevo",
            "lastName": "Cliente",
            "email": "nuevo@example.com",
            "sourcePolicyId": "pol-new-1",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["created"] is True
        assert body["client"]["firstName"] == "Nuevo"
        assert body["client"]["createdFrom"] == "policy_extraction"

    def test_returns_existing_client_on_email_duplicate(self, setup_aws):
        import handler
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Otro",
            "lastName": "Nombre",
            "email": "juan@example.com",  # Matches BASE_CLIENT
            "sourcePolicyId": "pol-linked-1",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["created"] is False
        assert body["matched"]["field"] == "email"
        assert body["matched"]["existingClientId"] == CLIENT_ID

    def test_returns_existing_client_on_rfc_duplicate(self, setup_aws):
        import handler
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Otro",
            "lastName": "Nombre",
            "rfc": "PEPJ850101XXX",  # Matches BASE_CLIENT
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["created"] is False
        assert body["matched"]["field"] == "rfc"

    def test_returns_existing_client_on_phone_duplicate(self, setup_aws):
        import handler
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Otro",
            "lastName": "Nombre",
            "phone": "+525512345678",  # Matches BASE_CLIENT
        })
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["created"] is False
        assert body["matched"]["field"] == "phone"

    def test_idempotent_same_source_policy_id(self, setup_aws):
        """Second call with the same sourcePolicyId returns the same client."""
        import handler
        body_payload = {
            "firstName": "Idempotent",
            "lastName": "Test",
            "email": "idempotent@example.com",
            "sourcePolicyId": "pol-idempotent-1",
        }
        # First call
        result1 = handler.handler(make_event("POST", "/clients/upsert", body=body_payload))
        assert result1["statusCode"] == 201
        client_id_1 = json.loads(result1["body"])["client"]["clientId"]

        # Second call — same sourcePolicyId
        result2 = handler.handler(make_event("POST", "/clients/upsert", body=body_payload))
        assert result2["statusCode"] == 200
        body2 = json.loads(result2["body"])
        assert body2["created"] is False
        assert body2["client"]["clientId"] == client_id_1
        assert body2["matched"]["field"] == "sourcePolicyId"

    def test_links_policy_to_existing_client_on_duplicate(self, setup_aws):
        """When duplicate is found, the policy's clientId should be updated."""
        import handler
        clients_table, policies_table = setup_aws
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Otro",
            "lastName": "Nombre",
            "email": "juan@example.com",
            "sourcePolicyId": POLICY_ID,
        })
        handler.handler(event)

        policy = policies_table.get_item(
            Key={"tenantId": TENANT_ID, "policyId": POLICY_ID}
        ).get("Item")
        assert policy.get("clientId") == CLIENT_ID

    def test_links_policy_to_new_client(self, setup_aws):
        """When a new client is created via upsert, the policy is linked."""
        import handler
        clients_table, policies_table = setup_aws
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Nuevo",
            "lastName": "Cliente",
            "email": "nuevo2@example.com",
            "sourcePolicyId": POLICY_ID,
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        new_client_id = json.loads(result["body"])["client"]["clientId"]

        policy = policies_table.get_item(
            Key={"tenantId": TENANT_ID, "policyId": POLICY_ID}
        ).get("Item")
        assert policy.get("clientId") == new_client_id

    def test_policy_count_incremented_on_new_client(self, setup_aws):
        import handler
        clients_table, policies_table = setup_aws
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Nuevo",
            "lastName": "Cliente",
            "email": "nuevo3@example.com",
            "sourcePolicyId": POLICY_ID,
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        new_client_id = json.loads(result["body"])["client"]["clientId"]

        client = clients_table.get_item(
            Key={"tenantId": TENANT_ID, "clientId": new_client_id}
        ).get("Item")
        assert client["policyCount"] >= 1

    def test_validation_errors_return_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients/upsert", body={
            "firstName": "Test",
            "lastName": "User",
            "email": "not-an-email",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_missing_names_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients/upsert", body={
            "email": "only@email.com",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400
