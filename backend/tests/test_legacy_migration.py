"""Legacy data mapping and the migration script end to end (against moto)."""

from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path
from typing import Any

from conftest import TABLE, TENANT_A, Api
from monethical.domain import legacy

OLD_BANNER = {
    "id": "b1",
    "status": "ATTIVO",
    "site_ref": "site_data/s1",
    "layout": "bottom-left",
    "banner_bg": "#112233",
    "title_text": "Cookie",
    "title_color": "white",  # not hex: falls back with a warning
    "body_text": "Usiamo cookie",
    "primary_btn_text": "Accetta",
    "primary_btn_bg": "#00aa00",
    "primary_btn_text_color": "#ffffff",
    "secondary_btn_text": "Rifiuta",
    "logo_url": "http://insecure.example.com/logo.png",
}


def test_map_banner_tokens_and_warnings() -> None:
    config, warnings = legacy.map_banner(OLD_BANNER)
    assert config.layout == "card-left" and config.surface.background == "#112233"
    assert config.surface.accent == "#00aa00" and config.texts.accept_all == "Accetta"
    assert config.logo_url is None  # insecure URL dropped
    assert any("title_color" in w for w in warnings) and any("logo_url" in w for w in warnings)
    inactive, _ = legacy.map_banner({**OLD_BANNER, "status": "DISATTIVO"})
    assert inactive.enabled is False


def test_domains_and_recipients() -> None:
    assert legacy.domains_for("https://www.Example.com/page") == ["example.com", "www.example.com"]
    assert legacy.domains_for("") == []
    assert legacy.recipients_of(["a@x.it", "bad", "a@x.it", " b@x.it "]) == ["a@x.it", "b@x.it"]
    assert legacy.recipients_of("info@x.it") == ["info@x.it"]
    form = legacy.legacy_contact_form(["info@x.it"])
    assert [f.key for f in form.fields] == ["name", "email", "phone", "message"]


def test_map_consent_keeps_time_order() -> None:
    old = {
        "timestamp": "2025-03-01T10:00:00Z",
        "analytics": True,
        "user_ip": "203.0.113.0",
        "consent_token": "tok-12345678",
    }
    newer = {"timestamp": "2025-03-02T10:00:00Z"}
    a, b = legacy.map_consent(old, "S", 1), legacy.map_consent(newer, "S", 1)
    assert a["SK"] < b["SK"] and a["analytics"] is True and a["visitor_id"] == "tok-12345678"
    assert a["created_at"].startswith("2025-03-01")


def test_migration_script_end_to_end(tmp_path: Path, console_a: Api, monkeypatch: Any) -> None:
    # run the script in-process against the moto table (same interpreter, patched argv)
    files = {
        "site_data.json": {
            "items": [
                {
                    "id": "s1",
                    "site_url": "https://www.rossi.example.com",
                    "ragione_sociale": "Rossi",
                }
            ]
        },
        "banners.json": {"items": [OLD_BANNER]},
        "consents.json": {
            "items": [
                {"banner_id": "banners/b1", "timestamp": "2025-03-01T10:00:00Z", "analytics": True}
            ]
        },
        "map.json": {
            "rossi.example.com": ["info@rossi.example.com"],
            "www.rossi.example.com": "info@rossi.example.com",
        },
    }
    for name, data in files.items():
        (tmp_path / name).write_text(json.dumps(data), encoding="utf-8")
    argv = [
        "migrate_legacy.py",
        "--table",
        TABLE,
        "--tenant-id",
        TENANT_A,
        "--site-data",
        str(tmp_path / "site_data.json"),
        "--banners",
        str(tmp_path / "banners.json"),
        "--consents",
        str(tmp_path / "consents.json"),
        "--formrelay-map",
        str(tmp_path / "map.json"),
    ]
    script = Path(__file__).resolve().parents[1] / "scripts" / "migrate_legacy.py"
    monkeypatch.setattr(sys, "argv", [*argv, "--dry-run"])
    namespace = runpy.run_path(str(script))
    assert namespace["main"]() == 0  # dry run writes nothing
    assert console_a.get("/v1/sites")[1] == []

    monkeypatch.setattr(sys, "argv", argv)
    assert namespace["main"]() == 0
    (site,) = console_a.get("/v1/sites")[1]
    assert site["domains"] == ["rossi.example.com", "www.rossi.example.com"]
    assert console_a.get(f"/v1/sites/{site['site_id']}/banner")[1]["layout"] == "card-left"
    assert len(console_a.get(f"/v1/sites/{site['site_id']}/forms")[1]) == 1
    consents = console_a.get(f"/v1/sites/{site['site_id']}/consents")[1]["items"]
    assert len(consents) == 1 and consents[0]["analytics"] is True
    # idempotent: a second run reuses the site instead of failing
    assert namespace["main"]() == 0
    assert len(console_a.get("/v1/sites")[1]) == 1
