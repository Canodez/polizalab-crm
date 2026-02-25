"""Tests for PATCH /clients/{clientId}."""
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
        # Second client (for duplicate check tests)
        clients_table.put_item(Item={
            **BASE_CLIENT,
            "clientId": "cli-2",
            "email": "second@example.com",
            "phone": "+525599999999",
            "rfc": "SECO900101AAA",
            "userId": USER_ID,
            "createdAt": "2026-01-02T00:00:00+00:00",
            "updatedAt": "2026-01-02T00:00:00+00:00",
        })
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


class TestPatchClient:
    def test_updates_allowed_fields(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"firstName": "Juan Updated", "lastName": "Perez Nuevo"},
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["firstName"] == "Juan Updated"
        assert body["lastName"] == "Perez Nuevo"

    def test_updatedAt_is_refreshed(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"notes": "some notes"},
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        body = json.loads(result["body"])
        assert body["updatedAt"] != "2026-01-01T00:00:00+00:00"

    def test_forbidden_fields_not_updated(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={
                "tenantId": "hacked",
                "clientId": "hacked",
                "userId": "hacked",
                "firstName": "Legit",
            },
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["tenantId"] == TENANT_ID
        assert body["clientId"] == CLIENT_ID
        assert body["userId"] == USER_ID

    def test_not_found_returns_404(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", "/clients/nonexistent",
            body={"firstName": "X"},
            path_params={"clientId": "nonexistent"},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 404

    def test_wrong_user_returns_403(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", "/clients/cli-other",
            body={"firstName": "Hacked"},
            path_params={"clientId": "cli-other"},
            user_id=USER_ID,
        )
        result = handler.handler(event)
        assert result["statusCode"] == 403

    def test_no_updatable_fields_returns_400(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"tenantId": "ignored"},
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_duplicate_email_on_patch_returns_409(self, setup_aws):
        import handler
        # Patching CLIENT_ID with second client's email should conflict
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"email": "second@example.com"},
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 409
        body = json.loads(result["body"])
        assert body["field"] == "email"
        assert body["existingClientId"] == "cli-2"

    def test_same_email_on_self_no_duplicate(self, setup_aws):
        """Patching the same email value that the client already has should not 409."""
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"email": "juan@example.com"},  # Same as own email
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        # Should succeed — email unchanged so no duplicate
        assert result["statusCode"] == 200

    def test_invalid_email_in_patch_returns_400(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"email": "bad-email"},
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_partial_update_preserves_other_fields(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={"notes": "new note"},
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        body = json.loads(result["body"])
        # Original fields should remain
        assert body["firstName"] == "Juan"
        assert body["lastName"] == "Perez"
        assert body["notes"] == "new note"

    def test_address_fields_update(self, setup_aws):
        import handler
        event = make_event(
            "PATCH", f"/clients/{CLIENT_ID}",
            body={
                "address": "Calle Nueva 100",
                "city": "Monterrey",
                "state": "Nuevo León",
                "zipCode": "64000",
            },
            path_params={"clientId": CLIENT_ID},
        )
        result = handler.handler(event)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["city"] == "Monterrey"
        assert body["zipCode"] == "64000"
