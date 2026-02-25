"""Tests for POST /clients."""
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

        # Seed existing client for duplicate tests
        clients_table.put_item(Item={**BASE_CLIENT})
        yield clients_table


class TestCreateClient:
    def test_creates_client_with_required_fields(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Carlos",
            "lastName": "Mendoza",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["firstName"] == "Carlos"
        assert body["lastName"] == "Mendoza"
        assert body["status"] == "active"
        assert body["createdFrom"] == "manual"
        assert body["policyCount"] == 0
        assert "clientId" in body
        assert "createdAt" in body
        assert "updatedAt" in body

    def test_created_client_persisted_in_dynamodb(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Ana",
            "lastName": "Torres",
            "email": "ana@example.com",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        item = ddb.Table("Clients").get_item(
            Key={"tenantId": TENANT_ID, "clientId": body["clientId"]}
        ).get("Item")
        assert item is not None
        assert item["email"] == "ana@example.com"

    def test_missing_first_name_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={"lastName": "Solo"})
        result = handler.handler(event)
        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert any("firstName" in d or "firstname" in d.lower() for d in body.get("details", []))

    def test_missing_last_name_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={"firstName": "Solo"})
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_empty_body_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={})
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_invalid_email_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "email": "not-an-email",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert any("email" in d.lower() for d in body.get("details", []))

    def test_invalid_rfc_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "rfc": "TOO-SHORT",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_invalid_curp_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "curp": "BADCURP",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_invalid_zip_code_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "zipCode": "123",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_10_digit_phone_normalized_to_e164(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "phone": "5512345000",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["phone"] == "+525512345000"

    def test_e164_phone_accepted(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "phone": "+525512345999",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["phone"] == "+525512345999"

    def test_invalid_phone_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "phone": "123",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_duplicate_email_returns_409(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Other",
            "lastName": "Person",
            "email": "juan@example.com",  # Already exists in BASE_CLIENT
        })
        result = handler.handler(event)
        assert result["statusCode"] == 409
        body = json.loads(result["body"])
        assert body["error"] == "Duplicate"
        assert body["field"] == "email"
        assert body["existingClientId"] == CLIENT_ID

    def test_duplicate_rfc_returns_409(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Other",
            "lastName": "Person",
            "rfc": "PEPJ850101XXX",  # Same as BASE_CLIENT
        })
        result = handler.handler(event)
        assert result["statusCode"] == 409
        body = json.loads(result["body"])
        assert body["error"] == "Duplicate"
        assert body["field"] == "rfc"

    def test_duplicate_phone_returns_409(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Other",
            "lastName": "Person",
            "phone": "+525512345678",  # Same as BASE_CLIENT
        })
        result = handler.handler(event)
        assert result["statusCode"] == 409
        body = json.loads(result["body"])
        assert body["field"] == "phone"

    def test_email_normalized_to_lowercase(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "email": "Test.User@EXAMPLE.COM",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["email"] == "test.user@example.com"

    def test_rfc_normalized_to_uppercase(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
            "rfc": "xexx010101000",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["rfc"] == "XEXX010101000"

    def test_first_name_whitespace_stripped(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "  Carlos  ",
            "lastName": "  Ruiz  ",
        })
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["firstName"] == "Carlos"
        assert body["lastName"] == "Ruiz"

    def test_invalid_json_body_returns_400(self, setup_aws):
        import handler
        event = make_event("POST", "/clients")
        event["body"] = "not-json"
        result = handler.handler(event)
        assert result["statusCode"] == 400

    def test_userId_set_from_jwt(self, setup_aws):
        import handler
        event = make_event("POST", "/clients", body={
            "firstName": "Test",
            "lastName": "User",
        }, user_id="specific-user-sub")
        result = handler.handler(event)
        assert result["statusCode"] == 201
        body = json.loads(result["body"])
        assert body["userId"] == "specific-user-sub"
