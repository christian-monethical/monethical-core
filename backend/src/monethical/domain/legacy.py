"""Mapping of legacy Agriconsent / FormRelay data onto the current model (used by the migration script)."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from monethical.core.ids import _encode
from monethical.domain import banner, forms
from monethical.domain.styles import Surface

_HEX = re.compile(r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
_VISITOR = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
CONSENT_TTL_SECONDS = 365 * 5 * 86400


def _hex(value: Any, default: str, warnings: list[str], field: str) -> str:
    if isinstance(value, str) and _HEX.match(value.strip()):
        return value.strip().lower()
    if value:
        warnings.append(f"{field}: '{value}' is not a hex color, using {default}")
    return default


def _text(value: Any, default: str, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else default


def map_layout(value: Any) -> banner.Layout:
    text = str(value or "").lower()
    if "top" in text:
        return "bar-top"
    if "left" in text:
        return "card-left"
    if "right" in text:
        return "card-right"
    if any(k in text for k in ("modal", "center", "popup")):
        return "modal"
    return "bar-bottom"


def host_from_site_url(site_url: str) -> str:
    raw = site_url.strip()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or "").lower()


def domains_for(site_url: str) -> list[str]:
    """Host with and without ``www`` (legacy services accepted both)."""
    host = host_from_site_url(site_url)
    if not host:
        return []
    bare = host.removeprefix("www.")
    return [bare, f"www.{bare}"]


def map_banner(old: dict[str, Any]) -> tuple[banner.BannerConfig, list[str]]:
    """Convert a legacy ``banners`` document into a BannerConfig (+ migration warnings)."""
    warnings: list[str] = []
    defaults = Surface()
    surface = Surface(
        background=_hex(old.get("banner_bg"), defaults.background, warnings, "banner_bg"),
        text=_hex(old.get("title_color"), defaults.text, warnings, "title_color"),
        muted=_hex(old.get("body_color"), defaults.muted, warnings, "body_color"),
        accent=_hex(old.get("primary_btn_bg"), defaults.accent, warnings, "primary_btn_bg"),
        accent_text=_hex(
            old.get("primary_btn_text_color"),
            defaults.accent_text,
            warnings,
            "primary_btn_text_color",
        ),
    )
    base = banner.BannerTexts()
    texts = banner.BannerTexts(
        title=_text(old.get("title_text"), base.title, 120),
        body=_text(old.get("body_text"), base.body, 2000),
        accept_all=_text(old.get("primary_btn_text"), base.accept_all, 120),
        reject_all=_text(old.get("secondary_btn_text"), base.reject_all, 120),
        customize=_text(old.get("prefs_btn_text"), base.customize, 120),
    )
    logo = old.get("logo_url")
    logo_ok = (
        isinstance(logo, str)
        and logo.startswith("https://")
        and not re.search(r"[\s\"'<>\\]", logo)
    )
    if logo and not logo_ok:
        warnings.append("logo_url dropped (not a safe https URL)")
    config = banner.BannerConfig(
        enabled=str(old.get("status", "ATTIVO")).upper() == "ATTIVO",
        layout=map_layout(old.get("layout")),
        surface=surface,
        texts=texts,
        logo_url=logo if logo_ok else None,
        categories=["necessary", "analytics", "marketing"],
    )
    return config, warnings


def new_id_at(epoch_seconds: float) -> str:
    """Time-sortable id for a historical moment (keeps imported consents ordered)."""
    import secrets

    return _encode(int(epoch_seconds * 1000), 10) + _encode(secrets.randbits(80), 16)


def parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str) and value:
        text = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return datetime.now(UTC)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return datetime.now(UTC)


def map_consent(old: dict[str, Any], site_id: str, banner_version: int) -> dict[str, Any]:
    """Convert a legacy ``consents`` document into a CONSENT# item for ``site_id``."""
    when = parse_timestamp(old.get("timestamp"))
    consent_id = new_id_at(when.timestamp())
    token = old.get("consent_token")
    item: dict[str, Any] = {
        "PK": f"SITE#{site_id}",
        "SK": f"CONSENT#{consent_id}",
        "type": "consent",
        "consent_id": consent_id,
        "created_at": when.isoformat(timespec="seconds"),
        "banner_version": banner_version,
        "preferences": False,
        "analytics": bool(old.get("analytics")),
        "marketing": bool(old.get("marketing")),
        "ip_prefix": str(old.get("user_ip") or "")[:45],
        "user_agent": str(old.get("user_agent") or "")[:300],
        "expires_at": int(when.timestamp()) + CONSENT_TTL_SECONDS,
        "imported": True,
    }
    if isinstance(token, str) and _VISITOR.match(token):
        item["visitor_id"] = token
    return item


def recipients_of(value: Any) -> list[str]:
    """FormRelay ``SITE_TO_EMAIL_MAP`` values are a string or a list of strings."""
    raw = value if isinstance(value, list) else [value]
    out: list[str] = []
    for entry in raw:
        email = str(entry or "").strip()
        if forms.EMAIL_RE.match(email) and email not in out:
            out.append(email)
    return out[:10]


def legacy_contact_form(recipients: list[str]) -> forms.FormConfig:
    """A form keeping the keys the old widget posts (name, email, phone, message)."""
    return forms.FormConfig(
        name="Contatti",
        recipients=recipients,
        fields=[
            forms.FormField(key="name", label="Nome", type="text", required=True, max_length=120),
            forms.FormField(
                key="email", label="Email", type="email", required=True, max_length=254
            ),
            forms.FormField(
                key="phone", label="Telefono", type="tel", required=False, max_length=50
            ),
            forms.FormField(
                key="message", label="Messaggio", type="textarea", required=True, max_length=3000
            ),
        ],
        privacy_required=False,
    )
