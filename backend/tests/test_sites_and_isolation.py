"""Sites, ownership isolation (the old cross-tenant IDOR must be impossible) and secret keys."""

from __future__ import annotations

from typing import Any

from conftest import Api


def test_create_and_list_sites(console_a: Api, site_a: dict[str, Any]) -> None:
    status, data, _ = console_a.get("/v1/sites")
    assert status == 200
    assert [s["site_id"] for s in data] == [site_a["site_id"]]
    assert site_a["site_key"].startswith("pk_live_")
    assert site_a["domains"] == ["rossi.example.com"]


def test_requires_authentication(public: Api) -> None:
    from monethical.handlers import console

    status, data, _ = Api(console.handler, None).get("/v1/sites")
    assert status == 401
    assert data["error"]["code"] == "unauthorized"


def test_plan_limit_on_sites(console_a: Api, site_a: dict[str, Any]) -> None:
    status, data, _ = console_a.post(
        "/v1/sites", {"name": "Second", "domains": ["second.example.com"]}
    )
    assert status == 403
    assert data["error"]["code"] == "plan_limit"


def test_domain_cannot_be_registered_twice(
    console_a: Api, console_b: Api, site_a: dict[str, Any]
) -> None:
    status, data, _ = console_b.post(
        "/v1/sites", {"name": "Thief", "domains": ["rossi.example.com"]}
    )
    assert status == 409
    assert data["error"]["code"] == "domain_taken"


def test_invalid_domain_rejected(console_a: Api) -> None:
    status, data, _ = console_a.post("/v1/sites", {"name": "Bad", "domains": ["not a domain!"]})
    assert status == 400
    assert data["error"]["code"] == "invalid_domain"


def test_other_tenant_cannot_touch_site(
    console_a: Api, console_b: Api, site_a: dict[str, Any]
) -> None:
    sid = site_a["site_id"]
    # Every site-scoped route returns 404 (never 403: existence is not leaked).
    probes = [
        ("GET", f"/v1/sites/{sid}"),
        ("GET", f"/v1/sites/{sid}/banner"),
        ("GET", f"/v1/sites/{sid}/consents"),
        ("GET", f"/v1/sites/{sid}/submissions"),
        ("GET", f"/v1/sites/{sid}/keys"),
        ("GET", f"/v1/sites/{sid}/forms"),
        ("GET", f"/v1/sites/{sid}/items"),
        ("GET", f"/v1/sites/{sid}/bookings"),
        ("GET", f"/v1/sites/{sid}/analytics"),
    ]
    for method, path in probes:
        status, data, _ = console_b.call(method, path)
        assert status == 404, (method, path, data)
    status, _, _ = console_b.put(f"/v1/sites/{sid}/banner", {"layout": "modal"})
    assert status == 404
    status, _, _ = console_b.delete(f"/v1/sites/{sid}")
    assert status == 404
    # ...and the owner still sees everything intact
    assert console_a.get(f"/v1/sites/{sid}")[0] == 200


def test_update_and_delete_site(console_a: Api, site_a: dict[str, Any], public: Api) -> None:
    sid = site_a["site_id"]
    status, data, _ = console_a.patch(
        f"/v1/sites/{sid}", {"domains": ["new.example.com"], "name": "Renamed"}
    )
    assert status == 200 and data["domains"] == ["new.example.com"]
    # the old domain is released and can be claimed again; the new one is taken
    from monethical.core import db, keys

    assert db.get(keys.domain("rossi.example.com"), keys.LOOKUP) is None
    assert db.get(keys.domain("new.example.com"), keys.LOOKUP) is not None
    assert console_a.delete(f"/v1/sites/{sid}")[0] == 204
    assert console_a.get(f"/v1/sites/{sid}")[0] == 404
    assert db.get(keys.domain("new.example.com"), keys.LOOKUP) is None
    assert db.get(keys.site_key(site_a["site_key"]), keys.LOOKUP) is None


def test_secret_keys_lifecycle(console_a: Api, site_a: dict[str, Any]) -> None:
    from monethical.core.errors import Forbidden, Unauthorized
    from monethical.domain import apikeys

    sid = site_a["site_id"]
    status, created, _ = console_a.post(
        f"/v1/sites/{sid}/keys", {"label": "export", "scopes": ["consents:read"]}
    )
    assert status == 200
    secret = created["secret"]
    assert secret.startswith("sk_live_")
    # stored only as hash; listing never returns the secret
    status, listed, _ = console_a.get(f"/v1/sites/{sid}/keys")
    assert status == 200 and "secret" not in listed[0] and listed[0]["prefix"] == secret[:12]
    assert apikeys.authenticate(secret, scope="consents:read")["site_id"] == sid
    try:
        apikeys.authenticate(secret, scope="bookings:read")
        raise AssertionError("scope must be enforced")
    except Forbidden:
        pass
    status, rotated, _ = console_a.post(f"/v1/sites/{sid}/keys/{created['key_id']}/rotate")
    assert status == 200 and rotated["secret"] != secret
    try:
        apikeys.authenticate(secret, scope="consents:read")
        raise AssertionError("old key must be dead")
    except Unauthorized:
        pass
    assert console_a.delete(f"/v1/sites/{sid}/keys/{rotated['key_id']}")[0] == 204
    assert console_a.get(f"/v1/sites/{sid}/keys")[1] == []


def test_staff_admin_requires_staff(console_a: Api, console_staff: Api) -> None:
    assert console_a.get("/v1/admin/accounts")[0] == 403
    assert console_staff.get("/v1/admin/accounts")[0] == 200
