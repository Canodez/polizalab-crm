"""Tests for policy-extract-worker handler."""
import json
import os
import pytest
from unittest.mock import patch, MagicMock
from moto import mock_aws
import boto3


@pytest.fixture(autouse=True)
def reset_clients():
    import handler
    handler._dynamodb = None
    handler._textract = None
    yield
    handler._dynamodb = None
    handler._textract = None


@pytest.fixture
def aws_env():
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@pytest.fixture
def table_with_policy(aws_env):
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
            "tenantId": "default", "policyId": "pol-1", "userId": "usr-1",
            "createdByUserId": "usr-1", "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z", "status": "UPLOADED",
            "s3KeyOriginal": "policies/default/usr-1/pol-1/original.pdf",
            "contentType": "application/pdf", "retryCount": 0,
            "s3Bucket": "test-bucket",
        })
        yield table


def make_event(policy_id: str) -> dict:
    return {
        "Records": [{
            "body": json.dumps({
                "tenantId": "default",
                "policyId": policy_id,
                "userId": "usr-1",
                "s3KeyOriginal": f"policies/default/usr-1/{policy_id}/original.pdf",
                "contentType": "application/pdf",
            }),
            "receiptHandle": "receipt-1",
        }]
    }


class TestExtractWorker:
    def test_successful_textract_start(self, table_with_policy):
        import handler
        mock_textract = MagicMock()
        mock_textract.start_document_analysis.return_value = {"JobId": "job-abc123"}

        with patch.object(handler, "get_textract", return_value=mock_textract):
            handler.handler(make_event("pol-1"))

        mock_textract.start_document_analysis.assert_called_once()
        call_kwargs = mock_textract.start_document_analysis.call_args[1]
        assert call_kwargs["FeatureTypes"] == ["FORMS", "TABLES"]

        # Verify DDB updated with PROCESSING status and textractJobId
        item = table_with_policy.get_item(
            Key={"tenantId": "default", "policyId": "pol-1"}
        ).get("Item")
        assert item["status"] == "PROCESSING"
        assert item["textractJobId"] == "job-abc123"

    def test_already_processing_skips(self, aws_env):
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
                "tenantId": "default", "policyId": "pol-proc", "userId": "usr-1",
                "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
                "status": "PROCESSING", "s3KeyOriginal": "some/key.pdf",
                "contentType": "application/pdf", "retryCount": 0, "s3Bucket": "test-bucket",
            })

            import handler
            mock_textract = MagicMock()
            with patch.object(handler, "get_textract", return_value=mock_textract):
                handler.handler(make_event("pol-proc"))

            # Textract should NOT be called
            mock_textract.start_document_analysis.assert_not_called()

    def test_transient_error_raises_for_sqs_retry(self, table_with_policy):
        import handler
        from botocore.exceptions import ClientError

        mock_textract = MagicMock()
        mock_textract.start_document_analysis.side_effect = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "StartDocumentAnalysis",
        )

        with patch.object(handler, "get_textract", return_value=mock_textract):
            with pytest.raises(ClientError):
                handler.handler(make_event("pol-1"))

        # retryCount should be incremented
        item = table_with_policy.get_item(
            Key={"tenantId": "default", "policyId": "pol-1"}
        ).get("Item")
        assert int(item.get("retryCount", 0)) >= 1

    def test_permanent_failure_sets_failed_status(self, aws_env):
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
            # Already at retryCount=3
            table.put_item(Item={
                "tenantId": "default", "policyId": "pol-max", "userId": "usr-1",
                "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
                "status": "UPLOADED", "s3KeyOriginal": "policies/default/usr-1/pol-max/original.pdf",
                "contentType": "application/pdf", "retryCount": 3, "s3Bucket": "test-bucket",
            })

            import handler
            from botocore.exceptions import ClientError

            mock_textract = MagicMock()
            mock_textract.start_document_analysis.side_effect = ClientError(
                {"Error": {"Code": "InternalServerError", "Message": "Internal error"}},
                "StartDocumentAnalysis",
            )

            event = {
                "Records": [{
                    "body": json.dumps({
                        "tenantId": "default", "policyId": "pol-max", "userId": "usr-1",
                        "s3KeyOriginal": "policies/default/usr-1/pol-max/original.pdf",
                        "contentType": "application/pdf",
                    }),
                    "receiptHandle": "r1",
                }]
            }

            with patch.object(handler, "get_textract", return_value=mock_textract):
                handler.handler(event)

            item = table.get_item(
                Key={"tenantId": "default", "policyId": "pol-max"}
            ).get("Item")
            assert item["status"] == "FAILED"
            assert "lastError" in item
