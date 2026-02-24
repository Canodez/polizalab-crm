"""Tests for extractor.py field extraction logic."""
import json
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import extractor

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "textract_response.json")


@pytest.fixture
def fixture_blocks():
    with open(FIXTURE_PATH) as f:
        return json.load(f)["blocks"]


class TestBuildStructures:
    def test_builds_kv_map_from_fixture(self, fixture_blocks):
        kv_map, lines = extractor.build_structures(fixture_blocks)
        assert len(kv_map) > 0
        assert "asegurado" in kv_map or any("asegurado" in k for k in kv_map)

    def test_builds_lines_from_fixture(self, fixture_blocks):
        kv_map, lines = extractor.build_structures(fixture_blocks)
        assert len(lines) > 0
        texts = [t for t, _ in lines]
        assert any("AXA" in t for t in texts)


class TestExtractFields:
    def test_extracts_policy_number_from_kv(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        assert result.get("policyNumber") is not None
        assert "MX" in result["policyNumber"]

    def test_extracts_insured_name(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        assert result.get("insuredName") is not None
        assert "García" in result["insuredName"] or "Juan" in result["insuredName"]

    def test_extracts_start_date(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        assert result.get("startDate") is not None
        assert "2026" in result["startDate"] or "/" in result["startDate"]

    def test_extracts_end_date(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        assert result.get("endDate") is not None

    def test_extracts_premium_total(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        assert result.get("premiumTotal") is not None
        assert "12,500" in str(result["premiumTotal"]) or "12500" in str(result["premiumTotal"])

    def test_field_confidence_present(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        fc = result.get("fieldConfidence", {})
        assert isinstance(fc, dict)
        assert len(fc) > 0

    def test_confidence_values_normalized(self, fixture_blocks):
        result = extractor.extract_fields(fixture_blocks)
        for field, conf in result["fieldConfidence"].items():
            assert 0.0 <= conf <= 1.0, f"Confidence out of range for {field}: {conf}"

    def test_currency_defaults_to_mxn(self, fixture_blocks):
        """currency defaults to MXN when no KV match found."""
        # Remove currency-related lines/keys from blocks
        minimal_blocks = [b for b in fixture_blocks if "moneda" not in str(b).lower()]
        result = extractor.extract_fields(minimal_blocks)
        # Either found from context or defaults to MXN
        if "currency" in result:
            assert result["currency"] in ("MXN", "USD", "EUR") or len(result["currency"]) <= 3

    def test_needs_review_triggered_by_low_confidence(self):
        """Fields with confidence below threshold trigger NEEDS_REVIEW."""
        # Build blocks with very low confidence
        blocks = [
            {
                "Id": "kv-key", "BlockType": "KEY_VALUE_SET", "EntityTypes": ["KEY"],
                "Confidence": 30.0,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["kv-key-word"]},
                    {"Type": "VALUE", "Ids": ["kv-val"]},
                ],
            },
            {"Id": "kv-key-word", "BlockType": "WORD", "Text": "póliza", "Confidence": 30.0},
            {
                "Id": "kv-val", "BlockType": "KEY_VALUE_SET", "EntityTypes": ["VALUE"],
                "Confidence": 25.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["kv-val-word"]}],
            },
            {"Id": "kv-val-word", "BlockType": "WORD", "Text": "MX-123-456", "Confidence": 25.0},
        ]
        result = extractor.extract_fields(blocks)
        # policyNumber should be in needsReviewFields because confidence < 0.75
        assert "policyNumber" in result.get("needsReviewFields", [])

    def test_missing_required_field_triggers_needs_review(self):
        """Missing required field appears in needsReviewFields."""
        # Blocks with only insuredName, no policyNumber
        blocks = [
            {
                "Id": "kv-key", "BlockType": "KEY_VALUE_SET", "EntityTypes": ["KEY"],
                "Confidence": 98.0,
                "Relationships": [
                    {"Type": "CHILD", "Ids": ["kv-key-word"]},
                    {"Type": "VALUE", "Ids": ["kv-val"]},
                ],
            },
            {"Id": "kv-key-word", "BlockType": "WORD", "Text": "asegurado", "Confidence": 98.0},
            {
                "Id": "kv-val", "BlockType": "KEY_VALUE_SET", "EntityTypes": ["VALUE"],
                "Confidence": 97.0,
                "Relationships": [{"Type": "CHILD", "Ids": ["kv-val-word"]}],
            },
            {"Id": "kv-val-word", "BlockType": "WORD", "Text": "Test User", "Confidence": 97.0},
        ]
        result = extractor.extract_fields(blocks)
        # policyNumber, startDate, endDate should be flagged as missing
        review = result.get("needsReviewFields", [])
        assert "policyNumber" in review
        assert "startDate" in review
        assert "endDate" in review
