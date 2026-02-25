"""Tests for GET /clients and GET /clients/check-duplicate."""
import json
import os
import pytest
import boto3
from moto import mock_aws

from conftest import (
    make_event, BASE_CLIENT, CLIENTS_TABLE_DEF, POLICIES_TABLE_DEF,
    USER_ID, OTHER_USER_ID, CLIENT_ID, TENANT_ID,
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

        # Seed: two clients owned by USER_ID, one by OTHER_USER_ID
        clients_table.put_item(Item={**BASE_CLIENT})
        clients_table.put_item(Item={
            **BASE_CLIENT,
            "clientId": "cli-2",
            "firstName": "Maria",
            "lastName": "Lopez",
            "email": "maria@example.com",
            "phone": "+525598765432",
            "rfc": "LOPM900202YYY",
            "status": "archived",
            "createdAt": "2026-01-02T00:00:00+00:00",
            "updatedAt": "2026-01-02T00:00:00+00:00",
        })
        clients_table.put_item(Item={
            **BASE_CLIENT,
            "clientId": "cli-other",
            "userId": OTHER_USER_ID,
            "email": "other@example.com",
            "phone": "+525511111111",
            "rfc": "OTHR010101ZZZ",
            "createdAt": "2026-01-03T00:00:00+00:00",
            "updatedAt": "2026-01-03T00:00:00+00:00",
        })
        yield clients_table


class TestListClients:
    def test_returns_only_current_user_clients(self, setup_aws):
        import handler
        event = make_event("GET", "/clients")
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        client_ids = [c["clientId"] for c in body["clients"]]
        assert "cli-other" not in client_ids
        assert body["count"] == 2

    def test_returns_empty_for_user_with_no_clients(self, setup_aws):
        import handler
        event = make_event("GET", "/clients", user_id="usr-nobody")
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["count"] == 0
        assert body["clients"] == []

    def test_status_filter_active(self, setup_aws):
        import handler
        event = make_event("GET", "/clients", query_params={"status": "active"})
        result = handler.handler(event)
        body = json.loads(result["body"])
        assert all(c["status"] == "active" for c in body["clients"])

    def test_status_filter_archived(self, setup_aws):
        import handler
        event = make_event("GET", "/clients", query_params={"status": "archived"})
        result = handler.handler(event)
        body = json.loads(result["body"])
        assert all(c["status"] == "archived" for c in body["clients"])

    def test_search_by_first_name(self, setup_aws):
        import handler
        event = make_event("GET", "/clients", query_params={"search": "juan"})
        result = handler.handler(event)
        body = json.loads(result["body"])
        # DynamoDB FilterExpression on GSI items
        for client in body["clients"]:
            combined = (
                client.get("firstName", "").lower()
                + client.get("lastName", "").lower()
                + client.get("email", "").lower()
                + client.get("phone", "").lower()
            )
            assert "juan" in combined

    def test_limit_param_respected(self, setup_aws):
        import handler
        event = make_event("GET", "/clients", query_params={"limit": "1"})
        result = handler.handler(event)
        body = json.loads(result["body"])
        assert body["count"] <= 1

    def test_invalid_next_token_returns_400(self, setup_aws):
        import handler
        event = make_event("GET", "/clients", query_params={"nextToken": "!invalid!"})
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_cors_header_present(self, setup_aws):
        import handler
        event = make_event("GET", "/clients")
        result = handler.handler(event)
        assert "Access-Control-Allow-Origin" in result["headers"]
        assert result["headers"]["Access-Control-Allow-Origin"] == "https://app.polizalab.com"

    def test_unauthorized_returns_401(self, setup_aws):
        import handler
        event = {
            "rawPath": "/clients",
            "requestContext": {"http": {"method": "GET", "path": "/clients"}},
            "headers": {},
            "pathParameters": {},
            "queryStringParameters": {},
            "body": None,
        }
        result = handler.handler(event)
        assert result["statusCode"] == 401
