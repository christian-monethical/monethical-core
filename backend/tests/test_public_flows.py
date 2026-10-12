"""Visitor-facing flows: consent, forms, newsletter, surveys, CORS/origin rules, snapshots, legacy."""

from __future__ import annotations

import json
from typing import Any

import boto3

from conftest import BUCKET, Api, drain_queue

ORIGIN = {"origin": "https://rossi.example.com"}


def pub(site: dict[str, Any], tail: str) -> str:
    return f"/public/{site['site_key']}{tail}"


def make_form(console: Api, site: dict[str, Any]) -> dict[str, Any]:
    status, form, _ = console.post(
        f"/v1/sites/{site['site_id']}/forms",
        {"name": "Contatti", "recipients": ["info@rossi.example.com"]},
    )
    assert status == 200, form
    return form  # type: ignore[no-any-return]


# ----------------------------------------------------------------------------- banner / consent


def test_banner_roundtrip_and_snapshot(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    status, cfg, _ = console_a.put(
        f"/v1/sites/{sid}/banner",
        {
            "layout": "modal",
            "surface": {"accent": "#ff0000"},
            "texts": {"title": "Ciao"},
            "language": "it",
        },
    )
    assert status == 200 and cfg["version"] == 1 and cfg["surface"]["accent"] == "#ff0000"
    assert console_a.put(f"/v1/sites/{sid}/banner", {"layout": "modal"})[1]["version"] == 2

    body = (
        boto3.client("s3")
        .get_object(Bucket=BUCKET, Key=f"config/{site_a['site_key']}/site.json")["Body"]
        .read()
    )
    doc = json.loads(body)
    assert doc["banner"]["layout"] == "modal" and doc["banner"]["version"] == 2
    assert "recipients" not in body.decode()  # public snapshot never carries private fields


def test_banner_rejects_unsafe_tokens(console_a: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    for bad in (
        {"surface": {"accent": "red; background:url(javascript:alert(1))"}},
        {"logo_url": "javascript:alert(1)"},
        {"logo_url": "http://insecure.example.com/a.png"},
        {"texts": {"title": "x" * 500}},
        {"unknown_field": True},
        {"categories": ["marketing"]},
    ):
        status, _, _ = console_a.put(f"/v1/sites/{sid}/banner", bad)
        assert status == 400, bad


def test_consent_requires_allowed_origin(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    payload = {"banner_version": 1, "analytics": True, "marketing": False}
    assert public.post(pub(site_a, "/consent"), payload)[0] == 403  # no Origin (curl)
    assert (
        public.post(
            pub(site_a, "/consent"), payload, headers={"origin": "https://evil.example.org"}
        )[0]
        == 403
    )
    status, data, headers = public.post(pub(site_a, "/consent"), payload, headers=ORIGIN)
    assert status == 200 and data == {"ok": True}
    assert headers["Access-Control-Allow-Origin"] == "https://rossi.example.com"

    status, page, _ = console_a.get(f"/v1/sites/{site_a['site_id']}/consents")
    assert status == 200 and len(page["items"]) == 1
    row = page["items"][0]
    assert (
        row["analytics"] is True and row["marketing"] is False and row["ip_prefix"] == "203.0.113.0"
    )
    assert "ip_hash" not in row  # raw IP is never stored or returned
    status, stats, _ = console_a.get(f"/v1/sites/{site_a['site_id']}/analytics")
    assert stats["totals"]["consent_total"] == 1 and stats["totals"]["consent_analytics"] == 1


def test_preflight_only_for_allowed_origin(public: Api, site_a: dict[str, Any]) -> None:
    ok = public.call("OPTIONS", pub(site_a, "/consent"), headers=ORIGIN)
    assert ok[0] == 204 and ok[2]["Access-Control-Allow-Origin"] == "https://rossi.example.com"
    assert (
        public.call(
            "OPTIONS", pub(site_a, "/consent"), headers={"origin": "https://evil.example.org"}
        )[0]
        == 403
    )


def test_www_variant_is_accepted(public: Api, site_a: dict[str, Any]) -> None:
    status, _, _ = public.post(
        pub(site_a, "/consent"),
        {"banner_version": 1},
        headers={"origin": "https://www.rossi.example.com"},
    )
    assert status == 200


def test_unknown_or_paused_site(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    assert public.get("/public/pk_live_" + "0" * 32 + "/site")[0] == 404
    assert public.get("/public/not-a-key/site")[0] == 404
    console_a.patch(f"/v1/sites/{site_a['site_id']}", {"status": "paused"})
    assert public.post(pub(site_a, "/consent"), {"banner_version": 1}, headers=ORIGIN)[0] == 404


def test_public_rate_limit(public: Api, site_a: dict[str, Any]) -> None:
    codes = [
        public.post(pub(site_a, "/consent"), {"banner_version": 1}, headers=ORIGIN)[0]
        for _ in range(25)
    ]
    assert codes[:20] == [200] * 20 and 429 in codes[20:]
    # a different visitor is unaffected
    assert (
        public.post(
            pub(site_a, "/consent"), {"banner_version": 1}, headers=ORIGIN, ip="198.51.100.9"
        )[0]
        == 200
    )


def test_oversized_body_rejected(public: Api, site_a: dict[str, Any]) -> None:
    big = {"banner_version": 1, "visitor_id": "a" * 50_000}
    assert public.post(pub(site_a, "/consent"), big, headers=ORIGIN)[0] == 413


def test_origin_verify_secret_blocks_direct_access(
    monkeypatch: Any, public: Api, site_a: dict[str, Any]
) -> None:
    monkeypatch.setenv("ORIGIN_VERIFY", "s3cret")
    assert public.get("/health")[0] == 403
    assert public.get("/health", headers={"x-origin-verify": "s3cret"})[0] == 200


# ----------------------------------------------------------------------------- forms


def test_form_submission_end_to_end(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    form = make_form(console_a, site_a)
    url = pub(site_a, f"/forms/{form['form_id']}/submit")
    data = {"name": "Mario", "email": "mario@example.com", "message": "Vorrei prenotare un weekend"}
    status, res, _ = public.post(url, {"data": data}, headers=ORIGIN)
    assert status == 200 and res == {"ok": True}

    status, page, _ = console_a.get(f"/v1/sites/{site_a['site_id']}/submissions")
    assert page["items"][0]["data"]["name"] == "Mario"
    msgs = drain_queue()
    assert [m["kind"] for m in msgs] == ["form_submission"]
    assert "mario@example.com" not in json.dumps(msgs)  # PII never travels through SQS


def test_form_validation_and_honeypot(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    form = make_form(console_a, site_a)
    url = pub(site_a, f"/forms/{form['form_id']}/submit")
    assert (
        public.post(url, {"data": {"name": "M", "email": "bad", "message": "x"}}, headers=ORIGIN)[0]
        == 400
    )
    assert (
        public.post(
            url,
            {"data": {"name": "Mario", "email": "m@example.com", "message": "x" * 4000}},
            headers=ORIGIN,
        )[0]
        == 400
    )
    # honeypot: bots get a success response but nothing is stored or queued
    status, res, _ = public.post(
        url,
        {
            "data": {"name": "Bot", "email": "b@example.com", "message": "buy now!!"},
            "website": "http://spam",
        },
        headers=ORIGIN,
    )
    assert status == 200 and res == {"ok": True}
    assert console_a.get(f"/v1/sites/{site_a['site_id']}/submissions")[1]["items"] == []
    assert drain_queue() == []


def test_form_config_validation(console_a: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    base = {"recipients": ["info@rossi.example.com"]}
    assert (
        console_a.post(f"/v1/sites/{sid}/forms", {**base, "recipients": ["not-an-email"]})[0] == 400
    )
    dup = [{"key": "a", "label": "A"}, {"key": "a", "label": "B"}]
    assert (
        console_a.post(f"/v1/sites/{sid}/forms", {**base, "fields": dup})[1]["error"]["code"]
        == "duplicate_field"
    )
    sel = [{"key": "s", "label": "S", "type": "select"}]
    assert (
        console_a.post(f"/v1/sites/{sid}/forms", {**base, "fields": sel})[1]["error"]["code"]
        == "missing_options"
    )


def test_email_rendering_escapes_html() -> None:
    from monethical.core import emailing

    text, html = emailing.render_form_email(
        "Site", "Form", [("Message", "<script>alert(1)</script>")]
    )
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert emailing.one_line("a\r\nBcc: evil@example.com") == "a Bcc: evil@example.com"


def test_worker_sends_email(
    console_a: Api, public: Api, site_a: dict[str, Any], monkeypatch: Any
) -> None:
    from monethical.handlers import worker

    sent: list[dict[str, Any]] = []
    monkeypatch.setattr("monethical.core.emailing.send", lambda **kw: sent.append(kw))
    form = make_form(console_a, site_a)
    public.post(
        pub(site_a, f"/forms/{form['form_id']}/submit"),
        {
            "data": {
                "name": "Mario",
                "email": "mario@example.com",
                "message": "Ciao a tutti, grazie",
            }
        },
        headers=ORIGIN,
    )
    (msg,) = drain_queue()
    event = {
        "Records": [
            {
                "messageId": "1",
                "receiptHandle": "r",
                "body": json.dumps(msg),
                "attributes": {},
                "messageAttributes": {},
                "md5OfBody": "",
                "eventSource": "aws:sqs",
                "eventSourceARN": "arn:aws:sqs:eu-north-1:1:q",
                "awsRegion": "eu-north-1",
            }
        ]
    }
    res = worker.handler(
        event,
        type(
            "C",
            (),
            {
                "function_name": "t",
                "memory_limit_in_mb": 1,
                "invoked_function_arn": "a",
                "aws_request_id": "r",
            },
        )(),
    )
    assert res == {"batchItemFailures": []}
    assert (
        sent[0]["to"] == ["info@rossi.example.com"] and sent[0]["reply_to"] == "mario@example.com"
    )


# ----------------------------------------------------------------------------- newsletter / surveys


def test_newsletter_flow(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    sub = {"email": "Fan@Example.com", "consent": True}
    assert (
        public.post(pub(site_a, "/newsletter/subscribe"), sub, headers=ORIGIN)[0] == 404
    )  # disabled
    console_a.put(f"/v1/sites/{sid}/newsletter", {"enabled": True})
    assert (
        public.post(
            pub(site_a, "/newsletter/subscribe"), {**sub, "consent": False}, headers=ORIGIN
        )[0]
        == 400
    )
    assert public.post(pub(site_a, "/newsletter/subscribe"), sub, headers=ORIGIN)[0] == 200
    assert (
        public.post(pub(site_a, "/newsletter/subscribe"), sub, headers=ORIGIN)[0] == 200
    )  # idempotent
    items = console_a.get(f"/v1/sites/{sid}/subscribers")[1]["items"]
    assert [i["email"] for i in items] == ["fan@example.com"]


def test_survey_flow(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    survey = console_a.post(
        f"/v1/sites/{sid}/surveys",
        {
            "title": "Soddisfazione",
            "questions": [
                {"key": "stars", "text": "Voto", "type": "rating"},
                {"key": "again", "text": "Torneresti?", "type": "boolean"},
                {"key": "comment", "text": "Commento", "type": "text", "required": False},
            ],
        },
    )[1]
    url = pub(site_a, f"/surveys/{survey['survey_id']}/respond")
    assert public.post(url, {"answers": {"stars": 9, "again": True}}, headers=ORIGIN)[0] == 400
    for stars in (5, 3):
        assert (
            public.post(
                url,
                {"answers": {"stars": stars, "again": True}},
                headers=ORIGIN,
                ip=f"198.51.100.{stars}",
            )[0]
            == 200
        )
    res = console_a.get(f"/v1/sites/{sid}/surveys/{survey['survey_id']}/results")[1]
    assert res["responses"] == 2 and res["questions"]["stars"]["average"] == 4.0


# ----------------------------------------------------------------------------- legacy adapters


def test_legacy_agriconsent_contract(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    console_a.put(
        f"/v1/sites/{sid}/banner", {"texts": {"title": "Cookie"}, "surface": {"accent": "#112233"}}
    )
    status, banner, _ = public.get(
        "/banners/by-site", query={"site_url": "https://www.rossi.example.com/"}, headers=ORIGIN
    )
    assert status == 200
    assert banner["id"] == sid and banner["status"] == "ATTIVO" and banner["title_text"] == "Cookie"
    assert banner["primary_btn_bg"] == "#112233"
    status, consent, _ = public.post(
        "/consents",
        {"banner_id": banner["id"], "necessary": True, "analytics": True, "marketing": False},
        headers=ORIGIN,
    )
    assert status == 200 and consent["analytics"] is True
    # a consent for someone else's banner id is refused
    assert public.post("/consents", {"banner_id": "other"}, headers=ORIGIN)[0] == 403
    assert public.get("/banners/by-site", query={"site_url": "unknown.example.org"})[0] == 404


def test_legacy_formrelay_contract(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    make_form(console_a, site_a)
    ok = public.post(
        "/contact",
        {"name": "Anna", "email": "anna@example.com", "message": "Messaggio di prova lungo"},
        headers=ORIGIN,
    )
    assert ok[0] == 200 and ok[1] == {"ok": True}
    assert len(console_a.get(f"/v1/sites/{site_a['site_id']}/submissions")[1]["items"]) == 1
    assert (
        public.post("/contact", {"name": "Anna", "email": "x", "message": "m"}, headers=ORIGIN)[0]
        == 400
    )
    assert (
        public.post(
            "/contact",
            {"name": "A", "email": "a@b.it", "message": "m"},
            headers={"origin": "https://evil.example.org"},
        )[0]
        == 404
    )
    honey = public.post(
        "/contact",
        {"name": "B", "email": "b@example.com", "message": "spam spam spam", "website": "x"},
        headers=ORIGIN,
    )
    assert (
        honey[0] == 200
        and len(console_a.get(f"/v1/sites/{site_a['site_id']}/submissions")[1]["items"]) == 1
    )
