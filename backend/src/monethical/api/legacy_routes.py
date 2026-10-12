"""Backward-compatible adapters for the two retired services.

* agriconsent-cookiesbanner:  GET /banners/by-site, POST /consents
* formrelay:                  POST /contact

Existing customer sites keep working unchanged; they only need their base URL repointed.
Both adapters resolve the site from the request Origin / ``site_url`` and reuse the new
domain logic (validation, storage, e-mail outbox).
"""

from __future__ import annotations

import time
from typing import Annotated, Any

from aws_lambda_powertools.event_handler import Response
from aws_lambda_powertools.event_handler.api_gateway import Router
from aws_lambda_powertools.event_handler.openapi.params import Body, Query
from pydantic import BaseModel, ConfigDict, Field

from monethical.api.common import error_response, json_response
from monethical.api.public_guard import client_ip, with_cors
from monethical.core import emailing, ratelimit, secrets
from monethical.core.errors import ApiError, BadRequest, Forbidden, NotFound
from monethical.core.ids import hash_ip
from monethical.core.origin import host_allowed, host_of
from monethical.domain import analytics, banner, forms, sites

router = Router()

LEGACY_LIMIT_PER_MINUTE = 20


class LegacyConsentIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    banner_id: str = Field(max_length=64)
    necessary: bool = True
    analytics: bool = False
    marketing: bool = False
    preferences: bool = False
    consent_token: str | None = Field(default=None, max_length=128)
    banner_version: int = 0


class LegacyContactIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=254)
    phone: str = Field(default="", max_length=50)
    message: str = Field(default="", max_length=3000)
    prefer_phone: bool = False
    website: str = Field(default="", max_length=200)  # honeypot


def _legacy_banner(site: dict[str, Any], cfg: banner.BannerStored) -> dict[str, Any]:
    """Shape of the original Agriconsent ``Banner`` response."""
    s, t = cfg.surface, cfg.texts
    return {
        "id": site["site_id"],
        "status": "ATTIVO",
        "logo_url": cfg.logo_url,
        "layout": cfg.layout,
        "banner_bg": s.background,
        "title_text": t.title,
        "title_color": s.text,
        "body_text": t.body,
        "body_color": s.muted,
        "primary_btn_text": t.accept_all,
        "primary_btn_bg": s.accent,
        "primary_btn_text_color": s.accent_text,
        "secondary_btn_text": t.reject_all,
        "secondary_btn_bg": s.background,
        "secondary_btn_text_color": s.text,
        "show_prefs_button": "analytics" in cfg.categories or "marketing" in cfg.categories,
        "prefs_btn_text": t.customize,
        "prefs_btn_text_color": s.text,
        "site_ref": site["site_id"],
        "version": cfg.version,
    }


def _origin_site(origin: str) -> tuple[dict[str, Any], bool]:
    host = host_of(origin)
    lookup = sites.lookup_by_host(host) if host else None
    if not lookup or lookup.get("status") != "active":
        raise NotFound("Site not found", code="site_not_found")
    return lookup, host_allowed(host, lookup["domains"])


@router.get("/banners/by-site")
def legacy_banner(site_url: Annotated[str, Query(max_length=300)]) -> Response[Any]:
    host = host_of(site_url if "://" in site_url else f"https://{site_url}")
    lookup = sites.lookup_by_host(host) if host else None
    if not lookup or lookup.get("status") != "active":
        return error_response(404, "site_not_found", "Sito non trovato")
    cfg = banner.get_config(lookup["site_id"])
    if cfg.version == 0 or not cfg.enabled:
        return error_response(400, "banner_inactive", "Banner non attivo")
    origin = router.current_event.headers.get("origin", "")
    return with_cors(
        json_response(200, _legacy_banner(lookup, cfg)),
        origin,
        host_allowed(host_of(origin), lookup["domains"]),
    )


@router.post("/consents")
def legacy_consent(payload: Annotated[LegacyConsentIn, Body()]) -> Response[Any]:
    event = router.current_event
    origin = event.headers.get("origin", "")
    try:
        lookup, allowed = _origin_site(origin)
        if not allowed or lookup["site_id"] != payload.banner_id:
            raise Forbidden("Origin not allowed", code="origin_not_allowed")
        ip = client_ip(event)
        ratelimit.hit(
            "legacy",
            f"{lookup['site_id']}#{hash_ip(ip, lookup['site_id'], secrets.ip_pepper())[:24]}",
            limit=LEGACY_LIMIT_PER_MINUTE,
        )
        cfg = banner.get_config(lookup["site_id"])
        consent_in = banner.ConsentIn(
            banner_version=cfg.version,
            preferences=payload.preferences,
            analytics=payload.analytics,
            marketing=payload.marketing,
        )
        cid = banner.record_consent(
            lookup["site_id"],
            consent_in,
            ip=ip,
            user_agent=str(event.headers.get("user-agent", "")),
            pepper=secrets.ip_pepper(),
            now_epoch=int(time.time()),
        )
        analytics.incr(lookup["site_id"], "consent_total")
    except ApiError as exc:
        return error_response(exc.status, exc.code, exc.message)
    body = {
        "id": cid,
        "banner_id": lookup["site_id"],
        "necessary": True,
        "analytics": payload.analytics,
        "marketing": payload.marketing,
        "consent_token": payload.consent_token,
    }
    return with_cors(json_response(200, body), origin, True)


@router.post("/contact")
def legacy_contact(payload: Annotated[LegacyContactIn, Body()]) -> Response[Any]:
    """FormRelay-compatible endpoint: ``{ok: true}`` on success, honeypot answers 200 silently."""
    event = router.current_event
    origin = event.headers.get("origin", "")
    try:
        lookup, allowed = _origin_site(origin)
        if not allowed:
            raise Forbidden("Origin not allowed", code="origin_not_allowed")
        ip = client_ip(event)
        ratelimit.hit(
            "legacy",
            f"{lookup['site_id']}#{hash_ip(ip, lookup['site_id'], secrets.ip_pepper())[:24]}",
            limit=LEGACY_LIMIT_PER_MINUTE,
        )
        if payload.website.strip():
            return with_cors(json_response(200, {"ok": True}), origin, True)
        enabled = [f for f in forms.list_forms(lookup["site_id"]) if f.enabled]
        if not enabled:
            raise NotFound("No contact form configured", code="form_not_found")
        form = enabled[0]
        raw: dict[str, Any] = {
            "name": payload.name,
            "email": payload.email,
            "phone": payload.phone,
            "message": payload.message,
            "privacy": True,
        }
        clean = forms.validate_submission(
            form, {k: v for k, v in raw.items() if k in {f.key for f in form.fields} | {"privacy"}}
        )
        if payload.prefer_phone and "phone" in {f.key for f in form.fields}:
            clean["prefer_phone"] = True
        sub_id = forms.store_submission(
            lookup["site_id"],
            form,
            clean,
            ip=ip,
            pepper=secrets.ip_pepper(),
            now_epoch=int(time.time()),
        )
        analytics.incr(lookup["site_id"], "form_submissions")
        emailing.enqueue(
            {
                "kind": "form_submission",
                "site_id": lookup["site_id"],
                "site_name": lookup["name"],
                "submission_id": sub_id,
            }
        )
    except BadRequest as exc:
        return with_cors(error_response(400, exc.code, exc.message), origin, True)
    except ApiError as exc:
        return error_response(exc.status, exc.code, exc.message)
    return with_cors(json_response(200, {"ok": True}), origin, True)
