"""Stripe Connect: tenants are paid directly into their own Stripe account."""

from __future__ import annotations

import time
from typing import Any

import stripe
from aws_lambda_powertools import Logger

from monethical.core import db, keys, secrets
from monethical.core.errors import BadRequest, Conflict, Forbidden, NotFound
from monethical.domain import catalog

logger = Logger(child=True)
HOLD_SECONDS = 30 * 60  # Stripe minimum Checkout expiry


def _api_key() -> str:
    secret, _ = secrets.stripe_keys()
    if not secret:
        raise Forbidden("Payments are not configured", code="payments_unavailable")
    return secret


def onboarding_link(tenant_id: str, *, return_url: str, refresh_url: str) -> str:
    key = _api_key()
    profile = db.get(keys.account(tenant_id), keys.PROFILE) or {}
    account_id = profile.get("stripe_account_id")
    if not account_id:
        account = stripe.Account.create(
            type="express", metadata={"tenant_id": tenant_id}, api_key=key
        )
        account_id = account["id"]
        db.update(
            keys.account(tenant_id), keys.PROFILE, set_values={"stripe_account_id": account_id}
        )
    link = stripe.AccountLink.create(
        account=account_id,
        refresh_url=refresh_url,
        return_url=return_url,
        type="account_onboarding",
        api_key=key,
    )
    return str(link["url"])


def refresh_status(tenant_id: str) -> dict[str, Any]:
    profile = db.get(keys.account(tenant_id), keys.PROFILE) or {}
    account_id = profile.get("stripe_account_id")
    if not account_id:
        return {"connected": False, "charges_enabled": False}
    account = stripe.Account.retrieve(account_id, api_key=_api_key())
    enabled = bool(account["charges_enabled"])
    db.update(keys.account(tenant_id), keys.PROFILE, set_values={"stripe_charges_enabled": enabled})
    return {"connected": True, "charges_enabled": enabled}


def create_checkout(
    site_id: str, tenant_id: str, booking: catalog.BookingOut, *, success_url: str, cancel_url: str
) -> str:
    profile = db.get(keys.account(tenant_id), keys.PROFILE) or {}
    if not profile.get("stripe_charges_enabled") or not profile.get("stripe_account_id"):
        raise Forbidden(
            "This business cannot accept online payments yet", code="payments_unavailable"
        )
    if booking.total_cents <= 0:
        raise BadRequest("Nothing to pay", code="nothing_to_pay")
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": booking.currency,
                    "unit_amount": booking.total_cents,
                    "product_data": {"name": booking.item_name[:120]},
                },
            }
        ],
        customer_email=booking.email,
        success_url=success_url,
        cancel_url=cancel_url,
        expires_at=int(time.time()) + HOLD_SECONDS + 60,
        metadata={"site_id": site_id, "booking_id": booking.booking_id},
        payment_intent_data={"metadata": {"site_id": site_id, "booking_id": booking.booking_id}},
        api_key=_api_key(),
        stripe_account=profile["stripe_account_id"],
        idempotency_key=f"checkout-{booking.booking_id}",
    )
    db.update(
        keys.site(site_id),
        f"{keys.SK_BOOKING}{booking.booking_id}",
        set_values={"stripe_session_id": session["id"]},
    )
    return str(session["url"])


def handle_webhook(payload: bytes, signature: str) -> str:
    """Verify and process a Stripe event. Idempotent per event id."""
    _, webhook_secret = secrets.stripe_keys()
    if not webhook_secret:
        raise Forbidden("Webhook not configured", code="webhook_unavailable")
    try:
        event = stripe.Webhook.construct_event(payload, signature, webhook_secret).to_dict()
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise BadRequest("Invalid signature", code="invalid_signature") from exc

    try:
        db.put(
            {
                "PK": f"STRIPEEVT#{event['id']}",
                "SK": keys.LOOKUP,
                "expires_at": int(time.time()) + 7 * 86400,
            },
            must_not_exist=True,
        )
    except Conflict:
        return "duplicate"

    kind = event["type"]
    obj = event["data"]["object"]
    meta = obj.get("metadata") or {}
    if kind in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        if obj.get("payment_status") == "paid" and meta.get("booking_id"):
            _mark(meta["site_id"], meta["booking_id"], obj["id"], "PAID")
    elif kind == "checkout.session.expired" and meta.get("booking_id"):
        _mark(meta["site_id"], meta["booking_id"], obj["id"], "CANCELLED")
    elif kind == "account.updated":
        tenant = (obj.get("metadata") or {}).get("tenant_id")
        if tenant:
            db.update(
                keys.account(tenant),
                keys.PROFILE,
                set_values={"stripe_charges_enabled": bool(obj.get("charges_enabled"))},
            )
    return "ok"


def _mark(site_id: str, booking_id: str, session_id: str, status: catalog.BookingStatus) -> None:
    try:
        raw = catalog.get_booking(site_id, booking_id)
    except NotFound:
        logger.warning("Webhook for unknown booking %s", booking_id)
        return
    if raw.get("stripe_session_id") != session_id:
        logger.warning("Session mismatch on booking %s", booking_id)
        return
    if raw["status"] in {"CANCELLED", "PAID", "COMPLETED"}:
        return
    catalog.set_booking_status(site_id, booking_id, status)
