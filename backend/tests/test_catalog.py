"""Catalog, availability, pricing and booking concurrency guarantees."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest

from conftest import Api

ORIGIN = {"origin": "https://rossi.example.com"}


def d(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def editable(item: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in item.items() if k not in {"item_id", "created_at", "updated_at"}}


def new_item(console: Api, site: dict[str, Any], **over: Any) -> dict[str, Any]:
    body = {
        "name": "Camera Blu",
        "slug": "camera-blu",
        "type": "ROOM",
        "price_cents": 10000,
        "capacity": 2,
        "cta_mode": "book",
    }
    body.update(over)
    status, item, _ = console.post(f"/v1/sites/{site['site_id']}/items", body)
    assert status == 200, item
    return item  # type: ignore[no-any-return]


def book(
    public: Api, site: dict[str, Any], slug: str, **over: Any
) -> tuple[int, Any, dict[str, Any]]:
    ip = over.pop("ip", "203.0.113.7")
    body = {
        "start": d(10),
        "end": d(12),
        "guests": 2,
        "name": "Mario Rossi",
        "email": "mario@example.com",
    }
    body.update(over)
    return public.post(f"/public/{site['site_key']}/items/{slug}/book", body, headers=ORIGIN, ip=ip)


def test_item_crud_and_slug_uniqueness(console_a: Api, site_a: dict[str, Any]) -> None:
    item = new_item(console_a, site_a)
    sid = site_a["site_id"]
    dup = console_a.post(
        f"/v1/sites/{sid}/items",
        {"name": "X", "slug": "camera-blu", "type": "ROOM", "price_cents": 1},
    )
    assert dup[0] == 409 and dup[1]["error"]["code"] == "slug_taken"
    other = new_item(console_a, site_a, name="Camera Verde", slug="camera-verde")
    clash = console_a.put(
        f"/v1/sites/{sid}/items/{other['item_id']}", {**editable(other), "slug": "camera-blu"}
    )
    assert clash[0] == 409
    renamed = console_a.put(
        f"/v1/sites/{sid}/items/{item['item_id']}", {**editable(item), "slug": "suite-blu"}
    )
    assert renamed[0] == 200
    assert console_a.delete(f"/v1/sites/{sid}/items/{item['item_id']}")[0] == 204
    new_item(console_a, site_a, name="Reuse", slug="suite-blu")  # freed slug is reusable


def test_room_booking_total_and_double_booking(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    new_item(console_a, site_a, discount_per_missing_guest_cents=1500)
    status, res, _ = book(public, site_a, "camera-blu", guests=1)
    assert status == 200, res
    assert res["booking"]["total_cents"] == 2 * (10000 - 1500)  # 2 nights, one guest missing
    assert res["booking"]["status"] == "CONFIRMED"
    # overlapping stay on the same room is refused, adjacent stay is fine
    assert book(public, site_a, "camera-blu", start=d(11), end=d(13), ip="198.51.100.2")[0] == 409
    assert book(public, site_a, "camera-blu", start=d(12), end=d(14), ip="198.51.100.3")[0] == 200


def test_total_is_computed_server_side(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    new_item(console_a, site_a)
    status, res, _ = book(public, site_a, "camera-blu", total_cents=1)
    assert status == 400  # unknown fields (client-supplied prices) are refused outright


def test_cancel_releases_capacity(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    new_item(console_a, site_a)
    booking = book(public, site_a, "camera-blu")[1]["booking"]
    assert book(public, site_a, "camera-blu", ip="198.51.100.4")[0] == 409
    sid = site_a["site_id"]
    assert (
        console_a.patch(
            f"/v1/sites/{sid}/bookings/{booking['booking_id']}", {"status": "CANCELLED"}
        )[0]
        == 200
    )
    assert book(public, site_a, "camera-blu", ip="198.51.100.5")[0] == 200
    # a cancelled booking cannot be revived
    assert (
        console_a.patch(
            f"/v1/sites/{sid}/bookings/{booking['booking_id']}", {"status": "CONFIRMED"}
        )[0]
        == 409
    )
    items = console_a.get(f"/v1/sites/{sid}/bookings")[1]["items"]
    assert len(items) == 2


def test_availability_and_price_overrides(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    item = new_item(console_a, site_a)
    sid = site_a["site_id"]
    assert (
        console_a.put(
            f"/v1/sites/{sid}/items/{item['item_id']}/prices", {"date": d(10), "price_cents": 20000}
        )[0]
        == 200
    )
    book(public, site_a, "camera-blu", start=d(11), end=d(12))
    status, days, _ = public.get(
        f"/public/{site_a['site_key']}/items/camera-blu/availability",
        query={"from": d(10), "to": d(13)},
        headers=ORIGIN,
    )
    assert status == 200
    assert [x["available"] for x in days] == [True, False, True]
    assert days[0]["price_cents"] == 20000 and days[2]["price_cents"] == 10000


def test_blocked_days(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    item = new_item(console_a, site_a)
    sid = site_a["site_id"]
    assert (
        console_a.post(
            f"/v1/sites/{sid}/items/{item['item_id']}/block", {"start": d(10), "end": d(11)}
        )[0]
        == 200
    )
    assert book(public, site_a, "camera-blu", start=d(10), end=d(11))[0] == 409
    assert (
        console_a.post(
            f"/v1/sites/{sid}/items/{item['item_id']}/block",
            {"start": d(10), "end": d(11), "blocked": False},
        )[0]
        == 200
    )
    assert book(public, site_a, "camera-blu", start=d(10), end=d(11))[0] == 200
    # cannot block days that already have a booking
    assert (
        console_a.post(
            f"/v1/sites/{sid}/items/{item['item_id']}/block", {"start": d(10), "end": d(11)}
        )[0]
        == 409
    )


def test_experience_capacity_per_slot(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    new_item(
        console_a,
        site_a,
        name="Degustazione",
        slug="degustazione",
        type="EXPERIENCE",
        capacity=4,
        price_cents=3000,
        slots=["10:00", "16:00"],
    )
    ok = book(public, site_a, "degustazione", start=d(5), end=None, slot="10:00", guests=3)
    assert ok[0] == 200 and ok[1]["booking"]["total_cents"] == 9000
    assert (
        book(
            public,
            site_a,
            "degustazione",
            start=d(5),
            end=None,
            slot="10:00",
            guests=2,
            ip="198.51.100.6",
        )[0]
        == 409
    )
    assert (
        book(
            public,
            site_a,
            "degustazione",
            start=d(5),
            end=None,
            slot="16:00",
            guests=2,
            ip="198.51.100.7",
        )[0]
        == 200
    )
    assert (
        book(public, site_a, "degustazione", start=d(5), end=None, slot="09:00", ip="198.51.100.8")[
            0
        ]
        == 400
    )  # not a slot


def test_product_stock(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    new_item(
        console_a, site_a, name="Olio", slug="olio", type="PRODUCT", capacity=3, price_cents=1200
    )
    assert book(public, site_a, "olio", start=d(1), end=None, guests=2)[0] == 200
    assert book(public, site_a, "olio", start=d(1), end=None, guests=2, ip="198.51.100.9")[0] == 409
    assert (
        book(public, site_a, "olio", start=d(1), end=None, guests=1, ip="198.51.100.10")[0] == 200
    )


def test_booking_input_validation(console_a: Api, public: Api, site_a: dict[str, Any]) -> None:
    new_item(console_a, site_a)
    assert book(public, site_a, "camera-blu", start=d(-3), end=d(-1))[0] == 400  # past
    assert book(public, site_a, "camera-blu", end=None)[0] == 400  # room needs an end
    assert book(public, site_a, "camera-blu", email="nope")[0] == 400
    assert book(public, site_a, "camera-blu", guests=5)[0] == 400  # room sleeps 2
    assert book(public, site_a, "camera-blu", start=d(10), end=d(100))[0] == 400  # too long
    assert public.post(f"/public/{site_a['site_key']}/items/missing/book", {}, headers=ORIGIN)[
        0
    ] in (400, 404)


def test_pay_mode_without_stripe_leaves_no_held_booking(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    new_item(console_a, site_a, cta_mode="pay")
    status, res, _ = book(
        public, site_a, "camera-blu", return_url="https://rossi.example.com/grazie"
    )
    assert status == 403 and res["error"]["code"] == "payments_unavailable"
    assert book(
        public,
        site_a,
        "camera-blu",
        cta_mode="book",
        return_url="https://rossi.example.com/x",
        ip="198.51.100.11",
    )[0] in (400, 403)
    # the failed attempt released the nights again
    ok = public.get(
        f"/public/{site_a['site_key']}/items/camera-blu/availability",
        query={"from": d(10), "to": d(12)},
        headers=ORIGIN,
    )
    assert all(x["available"] for x in ok[1])


def test_return_url_must_belong_to_site(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    new_item(console_a, site_a, cta_mode="pay")
    status, res, _ = book(public, site_a, "camera-blu", return_url="https://evil.example.org/phish")
    assert status == 400 and res["error"]["code"] == "invalid_return_url"


@pytest.mark.parametrize("path", ["items", "bookings"])
def test_catalog_lists_empty(console_a: Api, site_a: dict[str, Any], path: str) -> None:
    status, data, _ = console_a.get(f"/v1/sites/{site_a['site_id']}/{path}")
    assert status == 200 and (data == [] or data["items"] == [])


def test_console_calendar_shows_blocks_bookings_and_limits(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    item = new_item(console_a, site_a)
    sid = site_a["site_id"]
    console_a.post(f"/v1/sites/{sid}/items/{item['item_id']}/block", {"start": d(10), "end": d(11)})
    book(public, site_a, "camera-blu", start=d(11), end=d(12))
    status, days, _ = console_a.get(
        f"/v1/sites/{sid}/items/{item['item_id']}/calendar", query={"from": d(10), "to": d(13)}
    )
    assert status == 200
    assert [(x["available"], x["blocked"]) for x in days] == [
        (False, True),
        (False, False),
        (True, False),
    ]
    me = console_a.get("/v1/me")[1]
    assert me["limits"] == {
        "max_sites": 1,
        "max_forms_per_site": 1,
        "max_items_per_site": 5,
        "max_surveys_per_site": 2,
    }
