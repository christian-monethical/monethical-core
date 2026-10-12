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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, app in (("console", console.app), ("public", public.app)):
        schema = json.loads(app.get_openapi_json_schema())
        (OUT / f"{name}.json").write_text(
            json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"wrote docs/openapi/{name}.json ({len(schema.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()
