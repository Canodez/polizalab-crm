"""Tests for POST /clients/{clientId}/archive and POST /clients/{clientId}/unarchive."""
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

        clients_table.put_item(Item={**BASE_CLIENT})
        # Another user's client
        clients_table.put_item(Item={
            **BASE_CLIENT,
            "clientId": "cli-other",
            "userId": OTHER_USER_ID,
            "email": "other@example.com",
            "phone": "+525511111111",
            "rfc": "OTHR010101ZZZ",
        })
        yield clients_table


class TestArchiveClient:
    def test_archive_sets_status_to_archived(self, setup_aws):
        import handler
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/archive",
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is True
        assert body["status"] == "archived"

        # Verify in DynamoDB
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("Clients").get_item(
            Key={"tenantId": TENANT_ID, "clientId": CLIENT_ID}
        ).get("Item")
        assert item["status"] == "archived"

    def test_archive_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event(
            "POST", "/clients/nonexistent/archive",
            path_params={"clientId": "nonexistent"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_archive_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_event(
            "POST", "/clients/cli-other/archive",
            path_params={"clientId": "cli-other"},
            user_id=USER_ID,
        )
        result = handler.handler(event)
        assert result["statusCode"] == 403

    def test_archive_updates_updatedAt(self, setup_aws):
        import handler
        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/archive",
            path_params={"clientId": CLIENT_ID},
        )
        handler.handler(event)

        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("Clients").get_item(
            Key={"tenantId": TENANT_ID, "clientId": CLIENT_ID}
        ).get("Item")
        assert item["updatedAt"] != "2026-01-01T00:00:00+00:00"


class TestUnarchiveClient:
    def test_unarchive_sets_status_to_active(self, setup_aws):
        import handler
        # First archive
        clients_table = setup_aws
        clients_table.update_item(
            Key={"tenantId": TENANT_ID, "clientId": CLIENT_ID},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "archived"},
        )

        event = make_event(
            "POST", f"/clients/{CLIENT_ID}/unarchive",
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is True
        assert body["status"] == "active"

        # Verify in DynamoDB
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("Clients").get_item(
            Key={"tenantId": TENANT_ID, "clientId": CLIENT_ID}
        ).get("Item")
        assert item["status"] == "active"

    def test_unarchive_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event(
            "POST", "/clients/nonexistent/unarchive",
            path_params={"clientId": "nonexistent"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_unarchive_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_event(
            "POST", "/clients/cli-other/unarchive",
            path_params={"clientId": "cli-other"},
            user_id=USER_ID,
        )
        result = handler.handler(event)
        assert result["statusCode"] == 403
