"""Tests for input validation helpers in the client handler."""
import os
import sys
import pytest

os.environ.setdefault("CLIENTS_TABLE", "Clients")
os.environ.setdefault("POLICIES_TABLE", "Policies")
os.environ.setdefault("TENANT_ID", "default")
os.environ.setdefault("ALLOWED_ORIGIN", "*")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handler


class TestValidateClientFields:
    """Unit tests for the validate_client_fields() function."""

    # ── Required names ────────────────────────────────────────────────────────

    def test_valid_minimal_input(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "Juan", "lastName": "Perez"}, require_names=True
        )
        assert error is None
        assert sanitized["firstName"] == "Juan"
        assert sanitized["lastName"] == "Perez"

    def test_missing_first_name(self):
        _, error = handler.validate_client_fields(
            {"lastName": "Perez"}, require_names=True
        )
        assert error is not None
        assert error["statusCode"] == 400

    def test_missing_last_name(self):
        _, error = handler.validate_client_fields(
            {"firstName": "Juan"}, require_names=True
        )
        assert error is not None
        assert error["statusCode"] == 400

    def test_first_name_too_long(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A" * 101, "lastName": "B"}, require_names=True
        )
        assert error is not None

    def test_last_name_too_long(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B" * 101}, require_names=True
        )
        assert error is not None

    def test_names_stripped(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "  Juan  ", "lastName": "  Perez  "}, require_names=True
        )
        assert error is None
        assert sanitized["firstName"] == "Juan"
        assert sanitized["lastName"] == "Perez"

    # ── Email ─────────────────────────────────────────────────────────────────

    def test_valid_email(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "email": "Test@Example.com"}
        )
        assert error is None
        assert sanitized["email"] == "test@example.com"

    def test_invalid_email_no_at(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "email": "notanemail"}
        )
        assert error is not None

    def test_invalid_email_no_tld(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "email": "user@domain"}
        )
        assert error is not None

    def test_null_email_allowed(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "email": None}
        )
        assert error is None
        assert sanitized.get("email") is None

    def test_empty_string_email_treated_as_null(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "email": ""}
        )
        assert error is None
        assert sanitized.get("email") is None

    # ── Phone ─────────────────────────────────────────────────────────────────

    def test_e164_phone_accepted(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "phone": "+525512345678"}
        )
        assert error is None
        assert sanitized["phone"] == "+525512345678"

    def test_10_digit_phone_normalized(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "phone": "5512345678"}
        )
        assert error is None
        assert sanitized["phone"] == "+525512345678"

    def test_invalid_phone_rejected(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "phone": "123"}
        )
        assert error is not None

    def test_null_phone_allowed(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "phone": None}
        )
        assert error is None
        assert sanitized.get("phone") is None

    # ── RFC ───────────────────────────────────────────────────────────────────

    def test_valid_rfc_12_chars(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "rfc": "XEXX010101000"}
        )
        assert error is None
        assert sanitized["rfc"] == "XEXX010101000"

    def test_rfc_normalized_to_uppercase(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "rfc": "xexx010101000"}
        )
        assert error is None
        assert sanitized["rfc"] == "XEXX010101000"

    def test_invalid_rfc_too_short(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "rfc": "SHORT"}
        )
        assert error is not None

    def test_null_rfc_allowed(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "rfc": None}
        )
        assert error is None
        assert sanitized.get("rfc") is None

    # ── CURP ──────────────────────────────────────────────────────────────────

    def test_valid_curp(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "curp": "PEPJ850101HDFRRL09"}
        )
        assert error is None
        assert sanitized["curp"] == "PEPJ850101HDFRRL09"

    def test_invalid_curp_wrong_length(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "curp": "TOOSHORT"}
        )
        assert error is not None

    def test_null_curp_allowed(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "curp": None}
        )
        assert error is None

    # ── ZipCode ───────────────────────────────────────────────────────────────

    def test_valid_zip_code(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "zipCode": "06600"}
        )
        assert error is None
        assert sanitized["zipCode"] == "06600"

    def test_invalid_zip_code_too_short(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "zipCode": "123"}
        )
        assert error is not None

    def test_invalid_zip_code_non_numeric(self):
        _, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "zipCode": "ABCDE"}
        )
        assert error is not None

    def test_null_zip_code_allowed(self):
        sanitized, error = handler.validate_client_fields(
            {"firstName": "A", "lastName": "B", "zipCode": None}
        )
        assert error is None

    # ── Patch mode (require_names=False) ──────────────────────────────────────

    def test_patch_mode_no_names_required(self):
        sanitized, error = handler.validate_client_fields(
            {"notes": "A note"}, require_names=False
        )
        assert error is None
        assert sanitized.get("notes") == "A note"

    def test_patch_mode_first_name_empty_string_rejected(self):
        _, error = handler.validate_client_fields(
            {"firstName": "   "}, require_names=False
        )
        assert error is not None

    def test_patch_mode_last_name_too_long_rejected(self):
        _, error = handler.validate_client_fields(
            {"lastName": "X" * 101}, require_names=False
        )
        assert error is not None
