"""Tests for GET /clients/check-duplicate."""
import json
import os
import pytest
import boto3
from moto import mock_aws

from conftest import (
    make_event, BASE_CLIENT, CLIENTS_TABLE_DEF, POLICIES_TABLE_DEF,
    USER_ID, CLIENT_ID, TENANT_ID,
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
        ddb.create_table(**POLICIES_TABLE_DEF)

        clients_table.put_item(Item={**BASE_CLIENT})
        yield clients_table


class TestCheckDuplicate:
    def test_email_duplicate_found(self, setup_aws):
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"email": "juan@example.com"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["isDuplicate"] is True
        assert body["existingClient"]["clientId"] == CLIENT_ID
        assert body["existingClient"]["field"] == "email"

    def test_rfc_duplicate_found(self, setup_aws):
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"rfc": "PEPJ850101XXX"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["isDuplicate"] is True
        assert body["existingClient"]["field"] == "rfc"

    def test_phone_duplicate_found(self, setup_aws):
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"phone": "+525512345678"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["isDuplicate"] is True
        assert body["existingClient"]["field"] == "phone"

    def test_no_duplicate_found(self, setup_aws):
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"email": "nobody@example.com"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["isDuplicate"] is False
        assert "existingClient" not in body

    def test_phone_10_digit_normalized_before_lookup(self, setup_aws):
        """A 10-digit phone should be normalized to E.164 before checking."""
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"phone": "5512345678"},  # Stored as +525512345678
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["isDuplicate"] is True

    def test_missing_all_params_returns_400(self, setup_aws):
        import handler
        event = make_event("GET", "/clients/check-duplicate", query_params={})
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_existing_client_includes_name_fields(self, setup_aws):
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"email": "juan@example.com"},
        )
        result = handler.handler(event)
        body = json.loads(result["body"])
        existing = body["existingClient"]
        assert "firstName" in existing
        assert "lastName" in existing
        assert "clientId" in existing

    def test_email_case_insensitive_lookup(self, setup_aws):
        """Email lookup should match even if case differs from stored value."""
        import handler
        event = make_event(
            "GET", "/clients/check-duplicate",
            query_params={"email": "JUAN@EXAMPLE.COM"},
        )
        result = handler.handler(event)
        body = json.loads(result["body"])
        # Stored as lowercase, query normalized to lowercase — should match
        assert body["isDuplicate"] is True
