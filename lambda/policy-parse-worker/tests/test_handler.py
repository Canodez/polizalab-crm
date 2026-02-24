"""Tests for policy-parse-worker handler."""
import json
import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from moto import mock_aws
import boto3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import handler as parse_handler
import claude_extractor


FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "textract_response.json")

# A fully-extracted result returned by the mocked Claude extractor
GOOD_FIELDS = {
    "policyNumber": "MX-2026-001234",
    "insuredName": "Juan García López",
    "policyType": "Seguro de Autos",
    "insurer": "AXA Seguros",
    "startDate": "2026-01-01",
    "endDate": "2027-01-01",
    "premiumTotal": 12500.00,
    "currency": "MXN",
    "fieldConfidence": {
        "policyNumber": 0.98,
        "insuredName": 0.97,
        "policyType": 0.95,
        "insurer": 0.99,
        "startDate": 0.98,
        "endDate": 0.98,
        "premiumTotal": 0.96,
        "currency": 1.0,
    },
    "needsReviewFields": [],
}


@pytest.fixture(autouse=True)
def reset_clients():
    parse_handler._dynamodb = None
    parse_handler._textract = None
    parse_handler._s3 = None
    yield
    parse_handler._dynamodb = None
    parse_handler._textract = None
    parse_handler._s3 = None


@pytest.fixture
def aws_env():
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@pytest.fixture
def setup_aws_with_policy(aws_env):
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.create_table(
            TableName="Policies",
            AttributeDefinitions=[
                {"AttributeName": "tenantId", "AttributeType": "S"},
                {"AttributeName": "policyId", "AttributeType": "S"},
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "createdAt", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "tenantId", "KeyType": "HASH"},
                {"AttributeName": "policyId", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "userId-createdAt-index",
                    "KeySchema": [
                        {"AttributeName": "userId", "KeyType": "HASH"},
                        {"AttributeName": "createdAt", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="test-bucket")

        table.put_item(Item={
            "tenantId": "default", "policyId": "pol-1", "userId": "usr-1",
            "createdByUserId": "usr-1", "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z", "status": "PROCESSING",
            "s3KeyOriginal": "policies/default/usr-1/pol-1/original.pdf",
            "s3Bucket": "test-bucket", "contentType": "application/pdf", "retryCount": 0,
        })
        yield table


def make_event(job_id: str, status: str, policy_id: str = "pol-1") -> dict:
    job_tag = json.dumps({
        "policyId": policy_id,
        "tenantId": "default",
        "userId": "usr-1",
        "s3KeyTextractResult": f"policies/default/usr-1/{policy_id}/textract/result.json",
    })
    sns_message = json.dumps({
        "JobId": job_id,
        "Status": status,
        "JobTag": job_tag,
        "StatusMessage": "SUCCEEDED" if status == "SUCCEEDED" else "Analysis failed",
    })
    sns_envelope = json.dumps({"Type": "Notification", "Message": sns_message})
    return {"Records": [{"body": sns_envelope, "receiptHandle": "r1"}]}


class TestParseWorkerHandler:
    def test_sns_envelope_unwrapping(self, setup_aws_with_policy):
        """Handler correctly parses SNS-wrapped SQS record."""
        fixture_data = json.load(open(FIXTURE_PATH))

        mock_textract = MagicMock()
        mock_textract.get_document_analysis.return_value = {
            "Blocks": fixture_data["blocks"],
        }
        mock_s3 = MagicMock()

        with patch.object(parse_handler, "get_textract", return_value=mock_textract):
            with patch.object(parse_handler, "get_s3", return_value=mock_s3):
                with patch.object(claude_extractor, "extract_fields", return_value=dict(GOOD_FIELDS)):
                    parse_handler.handler(make_event("job-1", "SUCCEEDED"))

        mock_textract.get_document_analysis.assert_called_once_with(JobId="job-1")

    def test_textract_failed_status_sets_policy_failed(self, setup_aws_with_policy):
        """FAILED Textract notification → policy status=FAILED."""
        event = make_event("job-fail", "FAILED")
        parse_handler.handler(event)

        item = setup_aws_with_policy.get_item(
            Key={"tenantId": "default", "policyId": "pol-1"}
        ).get("Item")
        assert item["status"] == "FAILED"
        assert "lastError" in item

    def test_happy_path_sets_extracted_status(self, setup_aws_with_policy):
        """High-confidence extraction → EXTRACTED status."""
        fixture_data = json.load(open(FIXTURE_PATH))

        mock_textract = MagicMock()
        mock_textract.get_document_analysis.return_value = {"Blocks": fixture_data["blocks"]}
        mock_s3 = MagicMock()

        with patch.object(parse_handler, "get_textract", return_value=mock_textract):
            with patch.object(parse_handler, "get_s3", return_value=mock_s3):
                with patch.object(claude_extractor, "extract_fields", return_value=dict(GOOD_FIELDS)):
                    parse_handler.handler(make_event("job-ok", "SUCCEEDED"))

        item = setup_aws_with_policy.get_item(
            Key={"tenantId": "default", "policyId": "pol-1"}
        ).get("Item")
        assert item["status"] == "EXTRACTED"
        assert "extractionVersion" in item
        assert "fieldConfidence" in item

    def test_low_confidence_triggers_needs_review(self, setup_aws_with_policy):
        """Claude returning low-confidence fields → NEEDS_REVIEW with needsReviewFields populated."""
        low_conf_fields = {
            "policyNumber": "MX-123",
            "fieldConfidence": {
                "policyNumber": 0.4,
            },
            "needsReviewFields": ["policyNumber", "insuredName", "startDate", "endDate"],
        }

        mock_textract = MagicMock()
        mock_textract.get_document_analysis.return_value = {"Blocks": [
            {"Id": "line-1", "BlockType": "LINE", "Text": "MX-123", "Confidence": 40.0}
        ]}
        mock_s3 = MagicMock()

        with patch.object(parse_handler, "get_textract", return_value=mock_textract):
            with patch.object(parse_handler, "get_s3", return_value=mock_s3):
                with patch.object(claude_extractor, "extract_fields", return_value=low_conf_fields):
                    parse_handler.handler(make_event("job-low-conf", "SUCCEEDED"))

        item = setup_aws_with_policy.get_item(
            Key={"tenantId": "default", "policyId": "pol-1"}
        ).get("Item")
        assert item["status"] == "NEEDS_REVIEW"
        review_fields = item.get("needsReviewFields", [])
        assert len(review_fields) > 0

    def test_already_extracted_is_idempotent(self, aws_env):
        """Policy already EXTRACTED → skip re-processing."""
        with mock_aws():
            ddb = boto3.resource("dynamodb", region_name="us-east-1")
            table = ddb.create_table(
                TableName="Policies",
                AttributeDefinitions=[
                    {"AttributeName": "tenantId", "AttributeType": "S"},
                    {"AttributeName": "policyId", "AttributeType": "S"},
                    {"AttributeName": "userId", "AttributeType": "S"},
                    {"AttributeName": "createdAt", "AttributeType": "S"},
                ],
                KeySchema=[
                    {"AttributeName": "tenantId", "KeyType": "HASH"},
                    {"AttributeName": "policyId", "KeyType": "RANGE"},
                ],
                GlobalSecondaryIndexes=[
                    {
                        "IndexName": "userId-createdAt-index",
                        "KeySchema": [
                            {"AttributeName": "userId", "KeyType": "HASH"},
                            {"AttributeName": "createdAt", "KeyType": "RANGE"},
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                    }
                ],
                BillingMode="PAY_PER_REQUEST",
            )
            table.put_item(Item={
                "tenantId": "default", "policyId": "pol-done", "userId": "usr-1",
                "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
                "status": "EXTRACTED",
            })

            mock_textract = MagicMock()
            mock_s3 = MagicMock()

            event = make_event("job-dup", "SUCCEEDED", policy_id="pol-done")

            with patch.object(parse_handler, "get_textract", return_value=mock_textract):
                with patch.object(parse_handler, "get_s3", return_value=mock_s3):
                    parse_handler.handler(event)

            # Textract should NOT be called
            mock_textract.get_document_analysis.assert_not_called()
