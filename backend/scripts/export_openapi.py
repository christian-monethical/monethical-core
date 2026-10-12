"""Write the OpenAPI documents of both Lambdas to ``docs/openapi`` (input for TS client types).

Usage (from ``backend/``):  python scripts/export_openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from monethical.handlers import console, public  # noqa: E402

OUT = ROOT / "docs" / "openapi"


ERROR_SCHEMA = {
    "type": "object",
    "required": ["error"],
    "properties": {
        "error": {
            "type": "object",
            "required": ["code", "message"],
            "properties": {
                "code": {"type": "string"},
                "message": {"type": "string"},
                "details": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["field", "message"],
                        "properties": {"field": {"type": "string"}, "message": {"type": "string"}},
                    },
                },
            },
        }
    },
}


def use_real_error_shape(schema: dict) -> None:  # type: ignore[type-arg]
    """The server answers validation errors with 400 ``ApiErrorBody``, never 422 (document that)."""
    schemas = schema.setdefault("components", {}).setdefault("schemas", {})
    schemas["ApiErrorBody"] = ERROR_SCHEMA
    schemas.pop("HTTPValidationError", None)
    schemas.pop("ValidationError", None)
    schemas.pop("ResponseValidationError", None)
    ref = {"$ref": "#/components/schemas/ApiErrorBody"}
    for operations in schema.get("paths", {}).values():
        for op in operations.values():
            responses = op.get("responses", {})
            if responses.pop("422", None) is not None:
                responses["400"] = {
                    "description": "Invalid request or validation error",
                    "content": {"application/json": {"schema": ref}},
                }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, app in (("console", console.app), ("public", public.app)):
        schema = json.loads(app.get_openapi_json_schema())
        use_real_error_shape(schema)
        (OUT / f"{name}.json").write_text(
            json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"wrote docs/openapi/{name}.json ({len(schema.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()
