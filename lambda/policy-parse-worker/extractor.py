"""
Field extraction from Amazon Textract blocks.
Supports KEY_VALUE_SET (forms) and LINE (text) blocks.
"""
from __future__ import annotations

import os
import re
import logging
from statistics import mean
from typing import Any

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
REQUIRED_FIELDS_ENV = os.environ.get("REQUIRED_FIELDS", "policyNumber,insuredName,startDate,endDate")
REQUIRED_FIELDS = [f.strip() for f in REQUIRED_FIELDS_ENV.split(",") if f.strip()]

CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.75"))

FIELD_PATTERNS: dict[str, dict[str, Any]] = {
    "policyNumber": {
        "keys": ["póliza", "no. póliza", "número de póliza", "núm. póliza", "num. poliza", "no poliza"],
        "regex": r"\b[A-Z0-9]{2,5}[-/][A-Z0-9\-]{4,20}\b",
    },
    "insuredName": {
        "keys": [
            "asegurado", "nombre del asegurado", "titular", "contratante",
            "nombre del contratante", "nombre",
        ],
    },
    "startDate": {
        "keys": [
            "inicio de vigencia", "vigencia desde", "vigencia de", "fecha inicio",
            "inicio", "desde",
        ],
        "regex": r"\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b",
    },
    "endDate": {
        "keys": [
            "fin de vigencia", "vigencia al", "vigencia hasta", "fecha fin",
            "vencimiento", "expiraci", "hasta", "fin",
        ],
        "regex": r"\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b",
    },
    "insurer": {
        "keys": ["compañía", "aseguradora", "empresa emisora", "cia", "compania"],
    },
    "premiumTotal": {
        "keys": ["prima total", "prima neta", "total a pagar", "prima"],
        "regex": r"[\d,]+\.\d{2}",
    },
    "currency": {
        "keys": ["moneda", "currency"],
        "default": "MXN",
    },
}


# ── Block parsing ─────────────────────────────────────────────────────────────

def _get_text_and_confidence(block: dict, block_map: dict[str, dict]) -> tuple[str, float]:
    """Reconstruct text and average confidence for a block using its child WORD blocks."""
    text_parts = []
    confidences = []

    for rel in block.get("Relationships", []):
        if rel["Type"] == "CHILD":
            for child_id in rel["Ids"]:
                child = block_map.get(child_id, {})
                if child.get("BlockType") == "WORD":
                    text_parts.append(child.get("Text", ""))
                    confidences.append(child.get("Confidence", 0.0))

    text = " ".join(text_parts)
    avg_conf = mean(confidences) / 100.0 if confidences else (block.get("Confidence", 0.0) / 100.0)
    return text, avg_conf


def build_structures(blocks: list[dict]) -> tuple[dict, list]:
    """
    Build:
    - kv_map: {key_text_lower → (value_text, avg_confidence)}
    - lines: [(text, confidence)]
    """
    block_map = {b["Id"]: b for b in blocks}
    kv_map: dict[str, tuple[str, float]] = {}
    lines: list[tuple[str, float]] = []

    # Find KEY_VALUE_SET KEY blocks and their corresponding VALUE blocks
    for block in blocks:
        if block.get("BlockType") == "KEY_VALUE_SET" and "KEY" in block.get("EntityTypes", []):
            key_text, key_conf = _get_text_and_confidence(block, block_map)
            key_lower = key_text.lower().strip()
            if not key_lower:
                continue

            # Find VALUE block
            value_text = ""
            value_conf = key_conf
            for rel in block.get("Relationships", []):
                if rel["Type"] == "VALUE":
                    for val_id in rel["Ids"]:
                        val_block = block_map.get(val_id, {})
                        vt, vc = _get_text_and_confidence(val_block, block_map)
                        value_text = vt
                        value_conf = vc
                        break

            kv_map[key_lower] = (value_text, value_conf)

        elif block.get("BlockType") == "LINE":
            text = block.get("Text", "")
            conf = block.get("Confidence", 0.0) / 100.0
            if text:
                lines.append((text, conf))

    return kv_map, lines


# ── Field extraction ──────────────────────────────────────────────────────────

def _match_kv(field: str, kv_map: dict) -> tuple[str, float] | None:
    patterns = FIELD_PATTERNS.get(field, {})
    key_patterns = patterns.get("keys", [])

    for key_lower, (value, conf) in kv_map.items():
        for pat in key_patterns:
            if pat in key_lower:
                if value.strip():
                    return value.strip(), conf
    return None


def _match_regex(field: str, lines: list[tuple[str, float]]) -> tuple[str, float] | None:
    patterns = FIELD_PATTERNS.get(field, {})
    regex = patterns.get("regex")
    if not regex:
        return None

    full_text = " ".join(t for t, _ in lines)
    match = re.search(regex, full_text)
    if match:
        matched_text = match.group(0)
        # Find the line that contains this match and use its confidence
        for text, conf in lines:
            if matched_text in text:
                return matched_text, conf
        return matched_text, 0.5
    return None


def extract_fields(blocks: list[dict]) -> dict:
    """
    Extract policy fields from Textract blocks.
    Returns dict with field values, fieldConfidence, and needsReviewFields.
    """
    kv_map, lines = build_structures(blocks)

    extracted: dict[str, Any] = {}
    field_confidence: dict[str, float] = {}
    needs_review_fields: list[str] = []

    for field, config in FIELD_PATTERNS.items():
        value: str | None = None
        confidence: float = 0.0

        # 1. Try KV match
        kv_result = _match_kv(field, kv_map)
        if kv_result:
            value, confidence = kv_result

        # 2. Fallback to regex if KV failed or value is empty
        if not value:
            regex_result = _match_regex(field, lines)
            if regex_result:
                value, confidence = regex_result

        # 3. Use default if provided
        if not value:
            default = config.get("default")
            if default:
                value = default
                confidence = 1.0

        if value:
            extracted[field] = value
            field_confidence[field] = round(confidence, 4)

            if confidence < CONFIDENCE_THRESHOLD:
                needs_review_fields.append(field)

    # Check required fields
    for req_field in REQUIRED_FIELDS:
        if req_field not in extracted:
            needs_review_fields.append(req_field)
            if req_field not in needs_review_fields:
                needs_review_fields.append(req_field)

    # Deduplicate while preserving order
    seen = set()
    needs_review_deduped = []
    for f in needs_review_fields:
        if f not in seen:
            seen.add(f)
            needs_review_deduped.append(f)

    extracted["fieldConfidence"] = field_confidence
    extracted["needsReviewFields"] = needs_review_deduped

    return extracted
