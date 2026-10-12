"""Public (visitor-facing) routes. Every route here runs behind :func:`public_guard.guard`."""

from __future__ import annotations

import contextlib
import hashlib
import hmac
import time
from typing import Annotated, Any

from aws_lambda_powertools.event_handler.api_gateway import Router
from aws_lambda_powertools.event_handler.openapi.params import Body, Query
from pydantic import BaseModel, ConfigDict, Field

from monethical.core import db, emailing, keys, secrets
from monethical.core.errors import BadRequest, Conflict, Forbidden, NotFound
from monethical.core.ids import mask_ip
from monethical.core.origin import host_allowed, host_of
from monethical.domain import (
    analytics,
    banner,
    catalog,
    forms,
    newsletter,
    payments,
    snapshots,
    surveys,
)

router = Router()


class OkOut(BaseModel):
    ok: bool = True


class SubmitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: dict[str, Any] = Field(default_factory=dict)
    privacy: bool = False
    website: str = ""  # honeypot: real visitors never fill it


class SurveyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: dict[str, Any]


class BookIn(catalog.BookingIn):
    return_url: str | None = Field(default=None, max_length=500)


class BookOut(BaseModel):
    booking: catalog.BookingOut
    checkout_url: str | None = None


def _site() -> dict[str, Any]:
    return router.context["site"]  # type: ignore[no-any-return]


def _ip() -> str:
    return str(router.context["ip"])


def _now() -> int:
    return int(time.time())


# ----------------------------------------------------------------------------- site document


@router.get("/public/<site_key>/site")
def site_document(site_key: str) -> dict[str, Any]:
    """Origin-independent fallback for the CDN snapshot (used in local development)."""
    site = db.get(keys.site_key(site_key), keys.LOOKUP)
    if not site:
        raise NotFound("Site not found", code="site_not_found")
    full = db.get(keys.account(site["tenant_id"]), f"{keys.SK_SITE}{site['site_id']}")
    return snapshots.build_site_document(full or {})


# ----------------------------------------------------------------------------- consent


@router.post("/public/<site_key>/consent")
def post_consent(site_key: str, payload: Annotated[banner.ConsentIn, Body()]) -> OkOut:
    site = _site()
    banner.record_consent(
        site["site_id"],
        payload,
        ip=_ip(),
        user_agent=str(router.current_event.headers.get("user-agent", "")),
        pepper=secrets.ip_pepper(),
        now_epoch=_now(),
    )
    analytics.incr(site["site_id"], "consent_total")
    if payload.analytics:
        analytics.incr(site["site_id"], "consent_analytics")
    if payload.marketing:
        analytics.incr(site["site_id"], "consent_marketing")
    return OkOut()


# ----------------------------------------------------------------------------- forms


@router.post("/public/<site_key>/forms/<form_id>/submit")
def submit_form(site_key: str, form_id: str, payload: Annotated[SubmitIn, Body()]) -> OkOut:
    site = _site()
    form = forms.get_form(site["site_id"], form_id)
    if not form.enabled:
        raise NotFound("Form not found", code="form_not_found")
    if payload.website.strip():  # honeypot hit: pretend success, store nothing
        return OkOut()
    values = dict(payload.data)
    values["privacy"] = payload.privacy
    clean = forms.validate_submission(form, values)
    sub_id = forms.store_submission(
        site["site_id"], form, clean, ip=_ip(), pepper=secrets.ip_pepper(), now_epoch=_now()
    )
    analytics.incr(site["site_id"], "form_submissions")
    emailing.enqueue(
        {
            "kind": "form_submission",
            "site_id": site["site_id"],
            "site_name": site["name"],
            "submission_id": sub_id,
        }
    )
    return OkOut()


# ----------------------------------------------------------------------------- newsletter


def _unsub_token(site_id: str, email: str) -> str:
    return hmac.new(
        secrets.ip_pepper().encode(), f"unsub|{site_id}|{email.lower()}".encode(), hashlib.sha256
    ).hexdigest()[:32]


@router.post("/public/<site_key>/newsletter/subscribe")
def newsletter_subscribe(
    site_key: str, payload: Annotated[newsletter.SubscribeIn, Body()]
) -> OkOut:
    site = _site()
    cfg = newsletter.get_config(site["site_id"])
    if not cfg.enabled:
        raise NotFound("Newsletter not available", code="newsletter_disabled")
    if not payload.consent:
        raise BadRequest("Consent is required", code="consent_required")
    newsletter.subscribe(site["site_id"], payload, ip_prefix=mask_ip(_ip()))
    analytics.incr(site["site_id"], "newsletter_signups")
    return OkOut()


@router.get("/public/<site_key>/newsletter/unsubscribe")
def newsletter_unsubscribe(
    site_key: str,
    email: Annotated[str, Query(max_length=254)],
    token: Annotated[str, Query(max_length=64)],
) -> OkOut:
    site = _site()
    if not hmac.compare_digest(_unsub_token(site["site_id"], email), token):
        raise Forbidden("Invalid token", code="invalid_token")
    with contextlib.suppress(Conflict):  # unknown address: respond identically
        newsletter.unsubscribe(site["site_id"], email)
    return OkOut()


# ----------------------------------------------------------------------------- surveys


@router.post("/public/<site_key>/surveys/<survey_id>/respond")
def survey_respond(site_key: str, survey_id: str, payload: Annotated[SurveyIn, Body()]) -> OkOut:
    site = _site()
    survey = surveys.get_survey(site["site_id"], survey_id)
    if not survey.active:
        raise NotFound("Survey not found", code="survey_not_found")
    answers = surveys.validate_answers(survey, payload.answers)
    surveys.record_response(site["site_id"], survey, answers, now_epoch=_now())
    analytics.incr(site["site_id"], "survey_responses")
    return OkOut()


# ----------------------------------------------------------------------------- catalog


def _active_item(slug: str) -> catalog.ItemStored:
    item = catalog.get_item_by_slug(_site()["site_id"], slug)
    if not item.active:
        raise NotFound("Item not found", code="item_not_found")
    return item


@router.get("/public/<site_key>/items/<slug>/availability")
def item_availability(
    site_key: str,
    slug: str,
    start: Annotated[str, Query(alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$")],
    end: Annotated[str, Query(alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$")],
    guests: Annotated[int, Query(ge=1, le=1000)] = 1,
    slot: Annotated[str | None, Query(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")] = None,
) -> list[catalog.DayAvailability]:
    item = _active_item(slug)
    return catalog.availability(
        _site()["site_id"],
        item,
        catalog.parse_date(start),
        catalog.parse_date(end),
        guests=guests,
        slot=slot,
    )


@router.post("/public/<site_key>/items/<slug>/book")
def book_item(site_key: str, slug: str, payload: Annotated[BookIn, Body()]) -> BookOut:
    site = _site()
    item = _active_item(slug)
    booking = catalog.create_booking(site["site_id"], item, payload)
    checkout_url: str | None = None
    if item.cta_mode == "pay":
        try:
            base = _own_return_url(payload.return_url, site["domains"])
            joiner = "&" if "?" in base else "?"
            checkout_url = payments.create_checkout(
                site["site_id"],
                site["tenant_id"],
                booking,
                success_url=f"{base}{joiner}payment=success",
                cancel_url=f"{base}{joiner}payment=cancelled",
            )
        except Exception:
            # never leave a held-but-unpayable booking behind: release the capacity
            catalog.set_booking_status(site["site_id"], booking.booking_id, "CANCELLED")
            raise
    analytics.incr(site["site_id"], "bookings")
    emailing.enqueue(
        {
            "kind": "booking_created",
            "site_id": site["site_id"],
            "tenant_id": site["tenant_id"],
            "site_name": site["name"],
            "booking_id": booking.booking_id,
        }
    )
    return BookOut(booking=booking, checkout_url=checkout_url)


def _own_return_url(url: str | None, domains: list[str]) -> str:
    if not url or not url.startswith("https://") or not host_allowed(host_of(url), domains):
        raise BadRequest("return_url must be an https URL on this site", code="invalid_return_url")
    return url
