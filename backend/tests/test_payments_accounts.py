"""Stripe checkout + webhook handling and staff account administration."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import date, timedelta
from typing import Any

import boto3
import pytest

from conftest import TENANT_A, Api

ORIGIN = {"origin": "https://rossi.example.com"}
WEBHOOK_SECRET = "whsec_test_secret"


def d(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


@pytest.fixture
def stripe_ready(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    from monethical.core import config, secrets

    sm = boto3.client("secretsmanager")
    arn = sm.create_secret(
        Name="stripe",
        SecretString=json.dumps({"secret_key": "sk_test_x", "webhook_secret": WEBHOOK_SECRET}),
    )["ARN"]
    monkeypatch.setenv("STRIPE_SECRET_ARN", arn)
    config.get_settings.cache_clear()
    secrets.reset()
    calls: dict[str, Any] = {}

    def fake_session(**kwargs: Any) -> dict[str, str]:
        calls["session"] = kwargs
        return {"id": "cs_test_1", "url": "https://checkout.stripe.test/pay/cs_test_1"}

    monkeypatch.setattr("stripe.checkout.Session.create", fake_session)
    return calls


def signed(payload: dict[str, Any]) -> tuple[str, dict[str, str]]:
    body = json.dumps(payload)
    ts = int(time.time())
    sig = hmac.new(WEBHOOK_SECRET.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return body, {"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"}


def pay_item(console: Api, site: dict[str, Any]) -> None:
    console.post(
        f"/v1/sites/{site['site_id']}/items",
        {
            "name": "Camera",
            "slug": "camera",
            "type": "ROOM",
            "price_cents": 8000,
            "capacity": 2,
            "cta_mode": "pay",
        },
    )


def start_payment(
    public: Api, site: dict[str, Any], **over: Any
) -> tuple[int, Any, dict[str, Any]]:
    body = {
        "start": d(10),
        "end": d(11),
        "guests": 2,
        "name": "Mario",
        "email": "m@example.com",
        "return_url": "https://rossi.example.com/grazie",
    }
    body.update(over)
    return public.post(f"/public/{site['site_key']}/items/camera/book", body, headers=ORIGIN)


def enable_charges() -> None:
    from monethical.core import db, keys

    db.update(
        keys.account(TENANT_A),
        keys.PROFILE,
        set_values={"stripe_account_id": "acct_1", "stripe_charges_enabled": True},
    )


def event(
    kind: str,
    booking: dict[str, Any],
    site: dict[str, Any],
    *,
    event_id: str = "evt_1",
    paid: bool = True,
) -> dict[str, Any]:
    return {
        "id": event_id,
        "object": "event",
        "type": kind,
        "data": {
            "object": {
                "id": "cs_test_1",
                "object": "checkout.session",
                "payment_status": "paid" if paid else "unpaid",
                "metadata": {"site_id": site["site_id"], "booking_id": booking["booking_id"]},
            }
        },
    }


def test_checkout_then_paid_webhook(
    console_a: Api, public: Api, site_a: dict[str, Any], stripe_ready: dict[str, Any]
) -> None:
    pay_item(console_a, site_a)
    enable_charges()
    status, res, _ = start_payment(public, site_a)
    assert status == 200, res
    assert res["checkout_url"].startswith("https://checkout.stripe.test/")
    sent = stripe_ready["session"]
    assert sent["line_items"][0]["price_data"]["unit_amount"] == 8000  # price comes from the server
    assert (
        sent["stripe_account"] == "acct_1"
        and sent["metadata"]["booking_id"] == res["booking"]["booking_id"]
    )

    body, headers = signed(event("checkout.session.completed", res["booking"], site_a))
    assert public.call("POST", "/webhooks/stripe", body=body, headers=headers)[1] == {
        "received": "ok"
    }
    bookings = console_a.get(f"/v1/sites/{site_a['site_id']}/bookings")[1]["items"]
    assert bookings[0]["status"] == "PAID"
    # replays of the same event are ignored
    assert public.call("POST", "/webhooks/stripe", body=body, headers=headers)[1] == {
        "received": "duplicate"
    }


def test_expired_session_releases_nights(
    console_a: Api, public: Api, site_a: dict[str, Any], stripe_ready: dict[str, Any]
) -> None:
    pay_item(console_a, site_a)
    enable_charges()
    res = start_payment(public, site_a)[1]
    assert start_payment(public, site_a)[0] == 409  # held while payment is pending
    body, headers = signed(
        event("checkout.session.expired", res["booking"], site_a, event_id="evt_2", paid=False)
    )
    public.call("POST", "/webhooks/stripe", body=body, headers=headers)
    assert (
        console_a.get(f"/v1/sites/{site_a['site_id']}/bookings")[1]["items"][0]["status"]
        == "CANCELLED"
    )
    assert start_payment(public, site_a)[0] == 200


def test_webhook_rejects_bad_signature(public: Api, stripe_ready: dict[str, Any]) -> None:
    body = json.dumps({"id": "evt_x", "type": "x"})
    status, data, _ = public.call(
        "POST", "/webhooks/stripe", body=body, headers={"stripe-signature": "t=1,v1=deadbeef"}
    )
    assert status == 400 and data["error"]["code"] == "invalid_signature"


def test_webhook_session_mismatch_is_ignored(
    console_a: Api, public: Api, site_a: dict[str, Any], stripe_ready: dict[str, Any]
) -> None:
    pay_item(console_a, site_a)
    enable_charges()
    res = start_payment(public, site_a)[1]
    forged = event("checkout.session.completed", res["booking"], site_a, event_id="evt_3")
    forged["data"]["object"]["id"] = "cs_other"
    body, headers = signed(forged)
    public.call("POST", "/webhooks/stripe", body=body, headers=headers)
    assert (
        console_a.get(f"/v1/sites/{site_a['site_id']}/bookings")[1]["items"][0]["status"]
        == "PENDING"
    )


def test_payments_require_connected_account(
    console_a: Api, public: Api, site_a: dict[str, Any], stripe_ready: dict[str, Any]
) -> None:
    pay_item(console_a, site_a)
    status, data, _ = start_payment(public, site_a)
    assert status == 403 and data["error"]["code"] == "payments_unavailable"


def test_stripe_connect_urls_must_be_own_domains(
    console_a: Api,
    site_a: dict[str, Any],
    stripe_ready: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bad = console_a.post(
        "/v1/stripe/connect",
        {"return_url": "https://evil.example.org/", "refresh_url": "https://rossi.example.com/"},
    )
    assert bad[0] == 400 and bad[1]["error"]["code"] == "invalid_return_url"
    monkeypatch.setattr("stripe.Account.create", lambda **kw: {"id": "acct_9"})
    monkeypatch.setattr(
        "stripe.AccountLink.create", lambda **kw: {"url": "https://connect.stripe.test/onboard"}
    )
    ok = console_a.post(
        "/v1/stripe/connect",
        {
            "return_url": "https://rossi.example.com/ok",
            "refresh_url": "https://rossi.example.com/retry",
        },
    )
    assert ok[0] == 200 and ok[1]["url"].startswith("https://connect.stripe.test")
    monkeypatch.setattr("stripe.Account.retrieve", lambda *a, **kw: {"charges_enabled": True})
    assert console_a.get("/v1/stripe/status")[1] == {"connected": True, "charges_enabled": True}
    assert console_a.get("/v1/me")[1]["stripe_charges_enabled"] is True


# ----------------------------------------------------------------------------- staff accounts


@pytest.fixture
def pool(monkeypatch: pytest.MonkeyPatch) -> str:
    from monethical.core import config

    pool_id = boto3.client("cognito-idp").create_user_pool(PoolName="p")["UserPool"]["Id"]
    monkeypatch.setenv("USER_POOL_ID", pool_id)
    config.get_settings.cache_clear()
    return pool_id


def test_staff_creates_and_manages_accounts(console_staff: Api, pool: str, console_a: Api) -> None:
    status, acct, _ = console_staff.post(
        "/v1/admin/accounts",
        {"email": "Cliente@Example.com", "company": "Rossi Srl", "plan": "PRO"},
    )
    assert status == 200 and acct["plan"] == "PRO" and acct["email"] == "cliente@example.com"
    assert console_staff.post("/v1/admin/accounts", {"email": "cliente@example.com"})[0] == 409
    listing = console_staff.get("/v1/admin/accounts")[1]["items"]
    assert [a["email"] for a in listing] == ["cliente@example.com"]
    tid = acct["tenant_id"]
    assert (
        console_staff.patch(f"/v1/admin/accounts/{tid}", {"plan": "EMPIRE"})[1]["plan"] == "EMPIRE"
    )
    assert console_staff.patch("/v1/admin/accounts/unknown", {"plan": "PRO"})[0] == 404
    assert console_staff.get(f"/v1/admin/accounts/{tid}/sites")[1] == []


def test_suspending_account_unpublishes_sites(
    console_a: Api, console_staff: Api, site_a: dict[str, Any], public: Api
) -> None:
    from conftest import TENANT_A as tenant

    assert console_a.get("/v1/me")[0] == 200
    assert (
        console_staff.patch(f"/v1/admin/accounts/{tenant}", {"status": "suspended"})[1]["status"]
        == "suspended"
    )
    assert (
        public.post(f"/public/{site_a['site_key']}/consent", {"banner_version": 1}, headers=ORIGIN)[
            0
        ]
        == 404
    )
    assert console_a.get("/v1/sites")[0] == 403  # suspended accounts are locked out of the console
