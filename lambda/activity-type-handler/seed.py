"""
seed.py — Populate the ActivityTypesSystem DynamoDB table with default catalog items.

Usage:
  python seed.py [--table-name TABLE] [--region REGION]

Defaults:
  --table-name  ActivityTypesSystem-dev
  --region      us-east-1

Each item written:
  partitionKey      = "SYSTEM"
  code              = unique identifier string
  label             = display label (Spanish)
  sortOrder         = integer display order
  isFavoriteDefault = bool (pre-pinned to favorites panel)
  isActive          = True
  createdAt         = ISO 8601 UTC timestamp
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

# ── Catalog definition ────────────────────────────────────────────────────────

ACTIVITY_TYPES: list[dict] = [
    {
        "code":              "CONTACTO_INICIAL",
        "label":             "Contacto inicial",
        "sortOrder":         1,
        "isFavoriteDefault": True,
    },
    {
        "code":              "LLAMADA",
        "label":             "Llamada",
        "sortOrder":         2,
        "isFavoriteDefault": True,
    },
    {
        "code":              "WHATSAPP",
        "label":             "WhatsApp",
        "sortOrder":         3,
        "isFavoriteDefault": True,
    },
    {
        "code":              "REUNION",
        "label":             "Reunión",
        "sortOrder":         4,
        "isFavoriteDefault": True,
    },
    {
        "code":              "SEGUIMIENTO_COTIZACION",
        "label":             "Seguimiento de cotización",
        "sortOrder":         5,
        "isFavoriteDefault": True,
    },
    {
        "code":              "SOLICITAR_DOCUMENTOS",
        "label":             "Solicitar documentos",
        "sortOrder":         6,
        "isFavoriteDefault": False,
    },
    {
        "code":              "CONFIRMAR_PAGO",
        "label":             "Confirmar pago",
        "sortOrder":         7,
        "isFavoriteDefault": False,
    },
    {
        "code":              "RENOVACION_PRIMER_CONTACTO",
        "label":             "Primer contacto de renovación",
        "sortOrder":         8,
        "isFavoriteDefault": False,
    },
    {
        "code":              "RENOVACION_SEGUIMIENTO",
        "label":             "Seguimiento de renovación",
        "sortOrder":         9,
        "isFavoriteDefault": False,
    },
    {
        "code":              "TAREA_INTERNA",
        "label":             "Tarea interna",
        "sortOrder":         10,
        "isFavoriteDefault": False,
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed the ActivityTypesSystem DynamoDB table with default catalog items."
    )
    parser.add_argument(
        "--table-name",
        default="ActivityTypesSystem-dev",
        help="DynamoDB table name (default: ActivityTypesSystem-dev)",
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region (default: us-east-1)",
    )
    return parser.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()

    print(f"Connecting to DynamoDB table '{args.table_name}' in region '{args.region}'...")

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table_name)

    # Verify the table is reachable before writing
    try:
        table.load()
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "ResourceNotFoundException":
            print(f"ERROR: Table '{args.table_name}' does not exist in region '{args.region}'.")
            print("Create the table first using the CloudFormation template at:")
            print("  infrastructure/dynamodb/activity-types-tables.json")
        else:
            print(f"ERROR: Could not connect to DynamoDB: {e}")
        sys.exit(1)

    created_at = now_iso()
    total = len(ACTIVITY_TYPES)

    print(f"Writing {total} activity type(s)...\n")

    for idx, activity in enumerate(ACTIVITY_TYPES, start=1):
        item = {
            "partitionKey":      "SYSTEM",
            "code":              activity["code"],
            "label":             activity["label"],
            "sortOrder":         activity["sortOrder"],
            "isFavoriteDefault": activity["isFavoriteDefault"],
            "isActive":          True,
            "createdAt":         created_at,
        }

        try:
            table.put_item(Item=item)
            favorite_marker = "[favorito]" if activity["isFavoriteDefault"] else "         "
            print(
                f"  [{idx:02d}/{total}] {favorite_marker}  "
                f"{activity['code']:<35} sortOrder={activity['sortOrder']:>2}  "
                f"label='{activity['label']}'"
            )
        except ClientError as e:
            print(
                f"  [{idx:02d}/{total}] ERROR writing '{activity['code']}': "
                f"{e.response['Error']['Message']}"
            )
            sys.exit(1)

    print(f"\nDone. {total} item(s) written to '{args.table_name}'.")


if __name__ == "__main__":
    main()
