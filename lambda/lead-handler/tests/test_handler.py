"""Tests for lead-handler Lambda."""
import json
import os
import sys
import uuid
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

import pytest

# Setup env before import
os.environ["LEADS_TABLE"] = "Leads-test"
os.environ["CLIENTS_TABLE"] = "Clients-test"
os.environ["POLICIES_TABLE"] = "Policies-test"
os.environ["TENANT_ID"] = "test-tenant"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from handler import handler, validate_lead_fields, resp, VALID_STATUSES, VALID_PRODUCT_INTERESTS


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_event(method="GET", path="/leads", body=None, path_params=None, query_params=None, user_id="user-123"):
    event = {
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
            "http": {"method": method},
        },
        "rawPath": path,
        "pathParameters": path_params or {},
        "queryStringParameters": query_params or {},
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def parse_response(result):
    return result["statusCode"], json.loads(result["body"])


# ── Validation tests ────────────────────────────────────────────────────────

class TestValidation:
    def test_create_requires_fullName(self):
        sanitized, error = validate_lead_fields({"phone": "5512345678", "productInterest": "AUTO"}, is_create=True)
        assert error is not None
        _, body = parse_response(error)
        assert any("fullName" in d for d in body["details"])

    def test_create_requires_phone(self):
        sanitized, error = validate_lead_fields({"fullName": "Test Lead", "productInterest": "AUTO"}, is_create=True)
        assert error is not None
        _, body = parse_response(error)
        assert any("phone" in d for d in body["details"])

    def test_create_requires_productInterest(self):
        sanitized, error = validate_lead_fields({"fullName": "Test", "phone": "5512345678"}, is_create=True)
        assert error is not None
        _, body = parse_response(error)
        assert any("productInterest" in d for d in body["details"])

    def test_valid_create_fields(self):
        sanitized, error = validate_lead_fields({
            "fullName": "Maria Garcia",
            "phone": "5512345678",
            "productInterest": "AUTO",
            "email": "maria@test.com",
            "source": "WHATSAPP",
        }, is_create=True)
        assert error is None
        assert sanitized["fullName"] == "Maria Garcia"
        assert sanitized["phone"] == "+525512345678"  # 10-digit gets +52 prefix
        assert sanitized["productInterest"] == "AUTO"
        assert sanitized["email"] == "maria@test.com"

    def test_phone_e164_passthrough(self):
        sanitized, error = validate_lead_fields({
            "fullName": "Test",
            "phone": "+525512345678",
            "productInterest": "AUTO",
        }, is_create=True)
        assert error is None
        assert sanitized["phone"] == "+525512345678"

    def test_invalid_email_rejected(self):
        sanitized, error = validate_lead_fields({
            "fullName": "Test",
            "phone": "5512345678",
            "productInterest": "AUTO",
            "email": "not-an-email",
        }, is_create=True)
        assert error is not None

    def test_invalid_status_rejected(self):
        sanitized, error = validate_lead_fields({"status": "INVALID"}, is_create=False)
        assert error is not None

    def test_invalid_product_interest_rejected(self):
        sanitized, error = validate_lead_fields({
            "fullName": "Test",
            "phone": "5512345678",
            "productInterest": "INVALID",
        }, is_create=True)
        assert error is not None

    def test_patch_allows_partial(self):
        sanitized, error = validate_lead_fields({"fullName": "Updated Name"}, is_create=False)
        assert error is None
        assert sanitized["fullName"] == "Updated Name"

    def test_notes_length_limit(self):
        sanitized, error = validate_lead_fields({
            "notes": "x" * 2001,
        }, is_create=False)
        assert error is not None


# ── Handler routing tests ───────────────────────────────────────────────────

class TestRouting:
    def test_unauthorized_returns_401(self):
        event = make_event(user_id=None)
        event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"] = None
        # Manually break auth
        del event["requestContext"]["authorizer"]
        status, body = parse_response(handler(event))
        assert status == 401

    def test_unknown_route_returns_404(self):
        event = make_event(method="GET", path="/unknown")
        status, body = parse_response(handler(event))
        assert status == 404

    def test_invalid_json_body(self):
        event = make_event(method="POST", path="/leads")
        event["body"] = "not-json"
        status, body = parse_response(handler(event))
        assert status == 400
        assert "Invalid JSON" in body["error"]


# ── Create lead tests ───────────────────────────────────────────────────────

class TestCreateLead:
    @patch("handler.get_dynamodb")
    def test_create_lead_success(self, mock_dynamo):
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": []}  # no duplicate
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(
            method="POST",
            path="/leads",
            body={
                "fullName": "Maria Garcia Lopez",
                "phone": "5512345678",
                "productInterest": "AUTO",
                "source": "WHATSAPP",
            },
        )
        status, body = parse_response(handler(event))
        assert status == 201
        assert body["created"] is True
        assert body["lead"]["fullName"] == "Maria Garcia Lopez"
        assert body["lead"]["status"] == "NEW"
        mock_table.put_item.assert_called_once()

    @patch("handler.get_dynamodb")
    def test_create_lead_duplicate_phone_returns_existing(self, mock_dynamo):
        existing_lead = {
            "tenantId": "test-tenant",
            "leadId": "existing-lead-id",
            "userId": "user-123",
            "fullName": "Existing Lead",
            "phone": "+525512345678",
            "status": "NEW",
            "productInterest": "AUTO",
        }
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": [existing_lead]}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(
            method="POST",
            path="/leads",
            body={
                "fullName": "Maria Garcia",
                "phone": "5512345678",
                "productInterest": "AUTO",
            },
        )
        status, body = parse_response(handler(event))
        assert status == 200
        assert body["created"] is False
        assert body["duplicateOf"] == "existing-lead-id"

    @patch("handler.get_dynamodb")
    def test_create_validation_error(self, mock_dynamo):
        event = make_event(
            method="POST",
            path="/leads",
            body={"fullName": ""},  # Missing required fields
        )
        status, body = parse_response(handler(event))
        assert status == 400
        assert "details" in body


# ── List leads tests ────────────────────────────────────────────────────────

class TestListLeads:
    @patch("handler.get_dynamodb")
    def test_list_leads_empty(self, mock_dynamo):
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": []}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(method="GET", path="/leads")
        status, body = parse_response(handler(event))
        assert status == 200
        assert body["leads"] == []
        assert body["count"] == 0

    @patch("handler.get_dynamodb")
    def test_list_leads_with_results(self, mock_dynamo):
        leads = [
            {"leadId": "1", "fullName": "Lead One", "status": "NEW"},
            {"leadId": "2", "fullName": "Lead Two", "status": "CONTACTED"},
        ]
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": leads}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(method="GET", path="/leads")
        status, body = parse_response(handler(event))
        assert status == 200
        assert body["count"] == 2

    @patch("handler.get_dynamodb")
    def test_list_with_status_filter(self, mock_dynamo):
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": []}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(
            method="GET",
            path="/leads",
            query_params={"status": "NEW"},
        )
        status, body = parse_response(handler(event))
        assert status == 200
        # Verify filter was applied (query was called with FilterExpression)
        call_kwargs = mock_table.query.call_args.kwargs
        assert "FilterExpression" in call_kwargs


# ── Convert lead tests ──────────────────────────────────────────────────────

class TestConvertLead:
    @patch("handler.get_dynamodb")
    def test_convert_creates_client_no_duplicate(self, mock_dynamo):
        lead = {
            "tenantId": "test-tenant",
            "leadId": "lead-123",
            "userId": "user-123",
            "fullName": "Maria Garcia Lopez",
            "phone": "+525512345678",
            "email": "maria@test.com",
            "status": "QUOTING",
            "productInterest": "AUTO",
            "timeline": [],
        }
        mock_leads_table = MagicMock()
        mock_leads_table.get_item.return_value = {"Item": lead}
        mock_leads_table.update_item.return_value = {}

        mock_clients_table = MagicMock()
        # No duplicates found
        mock_clients_table.query.return_value = {"Items": []}

        def table_factory(name):
            if "Leads" in name:
                return mock_leads_table
            return mock_clients_table

        mock_dynamo.return_value.Table.side_effect = table_factory

        event = make_event(
            method="POST",
            path="/leads/lead-123/convert",
            path_params={"leadId": "lead-123"},
            body={},
        )
        status, body = parse_response(handler(event))
        assert status == 201
        assert body["success"] is True
        assert body["action"] == "created"
        assert body["clientId"] is not None

        # Verify client was created
        mock_clients_table.put_item.assert_called_once()
        created_client = mock_clients_table.put_item.call_args.kwargs["Item"]
        assert created_client["firstName"] == "Maria"
        assert created_client["lastName"] == "Garcia Lopez"
        assert created_client["originLeadId"] == "lead-123"

    @patch("handler.get_dynamodb")
    def test_convert_finds_duplicate_returns_existing(self, mock_dynamo):
        lead = {
            "tenantId": "test-tenant",
            "leadId": "lead-123",
            "userId": "user-123",
            "fullName": "Maria Garcia",
            "phone": "+525512345678",
            "status": "NEW",
            "productInterest": "AUTO",
            "timeline": [],
        }
        existing_client = {
            "tenantId": "test-tenant",
            "clientId": "client-999",
            "userId": "user-123",
            "firstName": "Maria",
            "lastName": "Garcia",
            "phone": "+525512345678",
        }

        mock_leads_table = MagicMock()
        mock_leads_table.get_item.return_value = {"Item": lead}

        mock_clients_table = MagicMock()
        mock_clients_table.query.return_value = {"Items": [existing_client]}

        def table_factory(name):
            if "Leads" in name:
                return mock_leads_table
            return mock_clients_table

        mock_dynamo.return_value.Table.side_effect = table_factory

        event = make_event(
            method="POST",
            path="/leads/lead-123/convert",
            path_params={"leadId": "lead-123"},
            body={},
        )
        status, body = parse_response(handler(event))
        assert status == 200
        assert body["success"] is False
        assert body["action"] == "duplicate_found"
        assert body["existingClient"]["clientId"] == "client-999"

    @patch("handler.get_dynamodb")
    def test_convert_already_converted_returns_error(self, mock_dynamo):
        lead = {
            "tenantId": "test-tenant",
            "leadId": "lead-123",
            "userId": "user-123",
            "fullName": "Maria Garcia",
            "convertedClientId": "already-converted",
            "status": "WON",
            "timeline": [],
        }
        mock_table = MagicMock()
        mock_table.get_item.return_value = {"Item": lead}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(
            method="POST",
            path="/leads/lead-123/convert",
            path_params={"leadId": "lead-123"},
            body={},
        )
        status, body = parse_response(handler(event))
        assert status == 400
        assert "already converted" in body["error"].lower()

    @patch("handler.get_dynamodb")
    def test_convert_force_link_to_existing(self, mock_dynamo):
        lead = {
            "tenantId": "test-tenant",
            "leadId": "lead-123",
            "userId": "user-123",
            "fullName": "Maria Garcia",
            "phone": "+525512345678",
            "status": "QUOTING",
            "timeline": [],
        }
        existing_client = {
            "tenantId": "test-tenant",
            "clientId": "client-999",
            "userId": "user-123",
            "firstName": "Maria",
            "lastName": "Garcia",
        }

        mock_leads_table = MagicMock()
        mock_leads_table.get_item.return_value = {"Item": lead}
        mock_leads_table.update_item.return_value = {}

        mock_clients_table = MagicMock()
        mock_clients_table.get_item.return_value = {"Item": existing_client}

        def table_factory(name):
            if "Leads" in name:
                return mock_leads_table
            return mock_clients_table

        mock_dynamo.return_value.Table.side_effect = table_factory

        event = make_event(
            method="POST",
            path="/leads/lead-123/convert",
            path_params={"leadId": "lead-123"},
            body={"forceLink": True, "linkClientId": "client-999"},
        )
        status, body = parse_response(handler(event))
        assert status == 200
        assert body["success"] is True
        assert body["action"] == "linked"
        assert body["clientId"] == "client-999"


# ── Log contact tests ──────────────────────────────────────────────────────

class TestLogContact:
    @patch("handler.get_dynamodb")
    def test_log_contact_success(self, mock_dynamo):
        lead = {
            "tenantId": "test-tenant",
            "leadId": "lead-123",
            "userId": "user-123",
            "fullName": "Test",
            "phone": "+525512345678",
            "status": "NEW",
            "timeline": [],
        }
        mock_table = MagicMock()
        mock_table.get_item.return_value = {"Item": lead}
        mock_table.update_item.return_value = {"Attributes": {**lead, "timeline": [{"id": "t1"}]}}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(
            method="POST",
            path="/leads/lead-123/log-contact",
            path_params={"leadId": "lead-123"},
            body={"type": "CALL", "note": "Spoke with client about auto quote"},
        )
        status, body = parse_response(handler(event))
        assert status == 200
        mock_table.update_item.assert_called_once()

    @patch("handler.get_dynamodb")
    def test_log_contact_requires_type_or_note(self, mock_dynamo):
        lead = {
            "tenantId": "test-tenant",
            "leadId": "lead-123",
            "userId": "user-123",
            "timeline": [],
        }
        mock_table = MagicMock()
        mock_table.get_item.return_value = {"Item": lead}
        mock_dynamo.return_value.Table.return_value = mock_table

        event = make_event(
            method="POST",
            path="/leads/lead-123/log-contact",
            path_params={"leadId": "lead-123"},
            body={},
        )
        status, body = parse_response(handler(event))
        assert status == 400
