"""
Claude-powered field extractor for Mexican insurance policy documents.
Replaces the regex/Textract KEY_VALUE_SET approach in extractor.py.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.75"))

REQUIRED_FIELDS = [
    "policyNumber", "insuredName", "policyType", "insurer", "startDate", "endDate",
]

_cached_api_key: Optional[str] = None
_ssm_client = None


def _get_ssm():
    global _ssm_client
    if _ssm_client is None:
        _ssm_client = boto3.client("ssm", region_name="us-east-1")
    return _ssm_client


def get_api_key() -> str:
    """Fetch Anthropic API key from SSM Parameter Store (cached per container)."""
    global _cached_api_key
    if _cached_api_key is not None:
        return _cached_api_key

    param_name = os.environ.get("ANTHROPIC_API_KEY_PARAM")
    if not param_name:
        raise ValueError("ANTHROPIC_API_KEY_PARAM environment variable not set")

    response = _get_ssm().get_parameter(Name=param_name, WithDecryption=True)
    _cached_api_key = response["Parameter"]["Value"]
    logger.info("Loaded Anthropic API key from SSM parameter %s", param_name)
    return _cached_api_key


SYSTEM_PROMPT = """\
You are an expert at reading Mexican insurance policy documents (pólizas de seguro).
Extract the following fields and return ONLY a valid JSON object with this exact structure:
{
  "fields": {
    "policyNumber": <string or null>,
    "insuredName": <string or null>,
    "policyType": <enum value or null>,
    "insurer": <string or null>,
    "startDate": <"YYYY-MM-DD" or null>,
    "endDate": <"YYYY-MM-DD" or null>,
    "premiumTotal": <number or null>,
    "currency": <"MXN"|"USD"|"EUR">,
    "rfc": <string or null>
  },
  "confidence": { "<field>": <0.0-1.0> }
}
Rules:
- Dates -> YYYY-MM-DD (convert from dd/mm/yyyy or dd-mm-yyyy).
- premiumTotal -> plain number, no commas or $ symbol.
- currency defaults to "MXN" if not explicitly stated.
- policyType must be exactly one of: "Seguro de Autos", "Seguro de Vida", \
"Seguro de Vida permanente", "Seguro de Gastos Médicos Mayores", \
"Seguro de Gastos Médicos Menores", "Seguro de Hogar", "Seguro de Daños", \
"Seguro de Responsabilidad Civil", "Seguro de Viaje", "Seguro Empresarial", "Otro"; \
use "Otro" if unclear.
- confidence = how certain you are the value is correct (1.0 = certain).
- Omit fields from confidence if they were not found (null).
- Return ONLY the JSON, no explanation, no markdown fences.\
"""


def extract_fields(text: str) -> dict:
    """
    Send raw document text to Claude and extract policy fields.

    Returns a dict with field values merged at the top level, plus:
      - fieldConfidence: {field: 0.0-1.0}
      - needsReviewFields: [field, ...]
    """
    import anthropic

    client = anthropic.Anthropic(api_key=get_api_key())

    logger.info("Calling claude-haiku-4-5 for field extraction (%d chars)", len(text))

    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Extract fields from this insurance document:\n\n{text}",
            }
        ],
    )

    raw_response = message.content[0].text
    logger.info("Claude response received (%d chars)", len(raw_response))

    # Strip markdown code fences if present (model sometimes adds them despite instructions)
    text = raw_response.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]  # drop opening fence line
        text = text.rsplit("```", 1)[0]  # drop closing fence
        text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(
            "Claude returned invalid JSON: %s\nResponse snippet: %s",
            e,
            raw_response[:500],
        )
        raise

    fields = parsed.get("fields", {})
    confidence = parsed.get("confidence", {})

    result: dict = {}
    field_confidence: dict = {}
    needs_review_fields: list = []

    for field_name, value in fields.items():
        if value is not None:
            result[field_name] = value
            conf = float(confidence.get(field_name, 0.0))
            field_confidence[field_name] = round(conf, 4)
            if conf < CONFIDENCE_THRESHOLD:
                needs_review_fields.append(field_name)

    # Flag required fields that are missing
    for req in REQUIRED_FIELDS:
        if req not in result and req not in needs_review_fields:
            needs_review_fields.append(req)

    result["fieldConfidence"] = field_confidence
    result["needsReviewFields"] = needs_review_fields

    return result
