"""Catalog (rooms, experiences, products), pricing, availability and bookings.

Concurrency model: capacity is enforced with one counter item per item/day
(``OCC#<item>#<day>``) updated inside the same DynamoDB transaction that creates the booking.
Two visitors can therefore never both take the last room-night or the last seat.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from monethical.core import db, keys
from monethical.core.errors import BadRequest, Conflict, Forbidden, NotFound
from monethical.core.ids import new_id, now_iso
from monethical.domain import plans
from monethical.domain.forms import EMAIL_RE
from monethical.domain.styles import HttpsUrl, LongText, ShortText, Surface

ItemType = Literal["ROOM", "EXPERIENCE", "PRODUCT"]
CtaMode = Literal["request", "book", "pay"]
BookingStatus = Literal["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED"]
ACTIVE_STATUSES = {"PENDING", "CONFIRMED", "PAID", "COMPLETED"}
MAX_NIGHTS = 60
MAX_RANGE_DAYS = 92

Slug = Annotated[
    str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", min_length=1, max_length=80)
]
Slot = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
IsoDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class ItemConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ShortText
    slug: Slug
    type: ItemType
    description: LongText = ""
    price_cents: int = Field(ge=0, le=10_000_000)
    capacity: int = Field(
        default=1, ge=0, le=1000
    )  # guests (room/experience) or stock (product, 0=∞)
    cta_mode: CtaMode = "request"
    image_url: HttpsUrl | None = None
    gallery: list[HttpsUrl] = Field(default_factory=list, max_length=8)
    amenities: list[ShortText] = Field(default_factory=list, max_length=20)
    discount_per_missing_guest_cents: int = Field(default=0, ge=0, le=10_000_000)
    available_from: IsoDate | None = None
    available_to: IsoDate | None = None
    min_nights: int = Field(default=1, ge=1, le=MAX_NIGHTS)
    slots: list[Slot] = Field(default_factory=list, max_length=12)
    duration_min: int | None = Field(default=None, ge=5, le=1440)
    active: bool = True
    button_text: ShortText = ""
    surface: Surface = Field(default_factory=Surface)


class ItemStored(ItemConfig):
    item_id: str
    created_at: str
    updated_at: str


def _to_item(raw: db.Item) -> ItemStored:
    return ItemStored.model_validate(
        {k: v for k, v in raw.items() if k not in {"PK", "SK", "type", "item_type"}}
        | {"type": raw["item_type"]}
    )


def _item_record(site_id: str, stored: ItemStored) -> db.Item:
    data = stored.model_dump()
    data["item_type"] = data.pop("type")
    return {
        "PK": keys.site(site_id),
        "SK": f"{keys.SK_ITEM}{stored.item_id}",
        "type": "item",
        **data,
    }


def _check_config(config: ItemConfig) -> None:
    for value in (config.available_from, config.available_to):
        if value:
            _parse(value)
    if (
        config.available_from
        and config.available_to
        and config.available_from > config.available_to
    ):
        raise BadRequest("available_from must not be after available_to", code="invalid_range")
    if config.type != "EXPERIENCE" and config.slots:
        raise BadRequest("Only experiences have time slots", code="invalid_slots")


def _parse(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise BadRequest(f"Invalid date: {value}", code="invalid_date") from exc


def list_items(site_id: str) -> list[ItemStored]:
    return [_to_item(i) for i in db.query_all(keys.site(site_id), sk_prefix=keys.SK_ITEM, cap=600)]


def get_item(site_id: str, item_id: str) -> ItemStored:
    raw = db.get(keys.site(site_id), f"{keys.SK_ITEM}{item_id}")
    if not raw:
        raise NotFound("Item not found", code="item_not_found")
    return _to_item(raw)


def get_item_by_slug(site_id: str, slug: str) -> ItemStored:
    lookup = db.get(keys.site(site_id), f"{keys.SK_SLUG}{slug}")
    if not lookup:
        raise NotFound("Item not found", code="item_not_found")
    return get_item(site_id, lookup["item_id"])


def create_item(site_id: str, plan: str, config: ItemConfig) -> ItemStored:
    _check_config(config)
    if len(list_items(site_id)) >= plans.limits(plan).max_items_per_site:
        raise Forbidden("Item limit reached for your plan", code="plan_limit")
    now = now_iso()
    stored = ItemStored(**config.model_dump(), item_id=new_id(), created_at=now, updated_at=now)
    try:
        db.transact(
            [
                db.Op("put", item=_item_record(site_id, stored)),
                db.Op(
                    "put",
                    item={
                        "PK": keys.site(site_id),
                        "SK": f"{keys.SK_SLUG}{config.slug}",
                        "item_id": stored.item_id,
                    },
                    condition="attribute_not_exists(PK)",
                ),
            ]
        )
    except Conflict as exc:
        raise Conflict("Slug already in use", code="slug_taken") from exc
    return stored


def update_item(site_id: str, item_id: str, config: ItemConfig) -> ItemStored:
    _check_config(config)
    existing = get_item(site_id, item_id)
    stored = ItemStored(
        **config.model_dump(), item_id=item_id, created_at=existing.created_at, updated_at=now_iso()
    )
    ops = [db.Op("put", item=_item_record(site_id, stored))]
    if config.slug != existing.slug:
        ops.append(
            db.Op(
                "put",
                item={
                    "PK": keys.site(site_id),
                    "SK": f"{keys.SK_SLUG}{config.slug}",
                    "item_id": item_id,
                },
                condition="attribute_not_exists(PK)",
            )
        )
        ops.append(
            db.Op("delete", key={"PK": keys.site(site_id), "SK": f"{keys.SK_SLUG}{existing.slug}"})
        )
    try:
        db.transact(ops)
    except Conflict as exc:
        raise Conflict("Slug already in use", code="slug_taken") from exc
    return stored


def delete_item(site_id: str, item_id: str) -> None:
    existing = get_item(site_id, item_id)
    pk = keys.site(site_id)
    for prefix in (f"OCC#{item_id}#", f"{keys.SK_PRICE}{item_id}#"):
        for raw in db.query_all(pk, sk_prefix=prefix, cap=2000):
            db.delete(pk, raw["SK"])
    db.delete(pk, f"{keys.SK_SLUG}{existing.slug}")
    db.delete(pk, f"{keys.SK_ITEM}{item_id}")


def public_catalog(site_id: str) -> list[dict[str, Any]]:
    out = []
    for i in list_items(site_id):
        if not i.active:
            continue
        data = i.model_dump(exclude={"created_at", "updated_at"})
        out.append(data)
    return out


# ----------------------------------------------------------------------------- price overrides


class PriceOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: IsoDate
    price_cents: int = Field(ge=0, le=10_000_000)
    slot: Slot | None = None


def _day_key(day: str, slot: str | None) -> str:
    return f"{day}T{slot}" if slot else day


def set_price_override(site_id: str, item_id: str, payload: PriceOverride) -> None:
    get_item(site_id, item_id)
    _parse(payload.date)
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_PRICE}{item_id}#{_day_key(payload.date, payload.slot)}",
            "type": "price_override",
            "price_cents": payload.price_cents,
        }
    )


def clear_price_override(site_id: str, item_id: str, day: str, slot: str | None) -> None:
    db.delete(keys.site(site_id), f"{keys.SK_PRICE}{item_id}#{_day_key(day, slot)}")


def list_price_overrides(site_id: str, item_id: str) -> list[dict[str, Any]]:
    prefix = f"{keys.SK_PRICE}{item_id}#"
    return [
        {"day": raw["SK"].removeprefix(prefix), "price_cents": raw["price_cents"]}
        for raw in db.query_all(keys.site(site_id), sk_prefix=prefix, cap=1000)
    ]


# ----------------------------------------------------------------------------- availability


class DayAvailability(BaseModel):
    day: str
    available: bool
    remaining: int | None
    price_cents: int


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=n) for n in range((end - start).days)]


def _occupancy(site_id: str, item_id: str, first: str, last: str) -> dict[str, db.Item]:
    prefix = f"OCC#{item_id}#"
    page = db.query(
        keys.site(site_id), sk_between=(f"{prefix}{first}", f"{prefix}{last}~"), limit=100
    )
    items = list(page.items)
    cursor = page.next_cursor
    while cursor:
        page = db.query(
            keys.site(site_id),
            sk_between=(f"{prefix}{first}", f"{prefix}{last}~"),
            limit=100,
            cursor=cursor,
        )
        items.extend(page.items)
        cursor = page.next_cursor
    return {i["SK"].removeprefix(prefix): i for i in items}


def _price_map(site_id: str, item_id: str, first: str, last: str) -> dict[str, int]:
    prefix = f"{keys.SK_PRICE}{item_id}#"
    page = db.query(
        keys.site(site_id), sk_between=(f"{prefix}{first}", f"{prefix}{last}~"), limit=100
    )
    return {i["SK"].removeprefix(prefix): int(i["price_cents"]) for i in page.items}


def availability(
    site_id: str,
    item: ItemStored,
    start: date,
    end: date,
    *,
    guests: int = 1,
    slot: str | None = None,
) -> list[DayAvailability]:
    """Per-day availability for [start, end). Rooms: nights. Others: days (per slot if given)."""
    if end <= start:
        raise BadRequest("end must be after start", code="invalid_range")
    if (end - start).days > MAX_RANGE_DAYS:
        raise BadRequest(f"Range too long (max {MAX_RANGE_DAYS} days)", code="range_too_long")
    first, last = start.isoformat(), (end - timedelta(days=1)).isoformat()
    occ = _occupancy(site_id, item.item_id, first, last)
    prices = _price_map(site_id, item.item_id, first, last)
    out: list[DayAvailability] = []
    for day in _days(start, end):
        key = day.isoformat()
        in_window = (not item.available_from or key >= item.available_from) and (
            not item.available_to or key <= item.available_to
        )
        counter = occ.get(_day_key(key, slot), {})
        taken = int(counter.get("taken", 0))
        blocked = bool(counter.get("blocked")) or bool(occ.get(key, {}).get("blocked"))
        if item.type == "ROOM":
            remaining = 0 if (taken or blocked) else 1
            ok = in_window and remaining == 1 and guests <= max(item.capacity, 1)
        else:
            cap = item.capacity if item.capacity else 10**6
            remaining = max(cap - taken, 0)
            ok = in_window and not blocked and remaining >= guests
        out.append(
            DayAvailability(
                day=key,
                available=ok,
                remaining=remaining,
                price_cents=prices.get(_day_key(key, slot), prices.get(key, item.price_cents)),
            )
        )
    return out


# ----------------------------------------------------------------------------- quote


class Quote(BaseModel):
    item_id: str
    start: str
    end: str
    guests: int
    total_cents: int
    currency: str = "eur"
    nights: int


def _nightly(item: ItemStored, base: int, guests: int) -> int:
    missing = max(0, max(item.capacity, 1) - min(guests, max(item.capacity, 1)))
    return max(0, base - missing * item.discount_per_missing_guest_cents)


def quote(
    site_id: str, item: ItemStored, start: date, end: date, guests: int, slot: str | None = None
) -> tuple[Quote, list[DayAvailability]]:
    if item.type != "ROOM" and end <= start:
        end = start + timedelta(days=1)
    days = availability(site_id, item, start, end, guests=guests, slot=slot)
    if item.type == "ROOM":
        if len(days) > MAX_NIGHTS or len(days) < item.min_nights:
            raise BadRequest(
                f"Stay must be {item.min_nights}-{MAX_NIGHTS} nights", code="invalid_stay"
            )
        total = sum(_nightly(item, d.price_cents, guests) for d in days)
    elif item.type == "EXPERIENCE":
        total = sum(d.price_cents for d in days) * guests
    else:
        total = sum(d.price_cents for d in days) * guests  # quantity
    return Quote(
        item_id=item.item_id,
        start=start.isoformat(),
        end=end.isoformat(),
        guests=guests,
        total_cents=total,
        nights=len(days),
    ), days


# ----------------------------------------------------------------------------- bookings


class BookingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: IsoDate
    end: IsoDate | None = None
    slot: Slot | None = None
    guests: int = Field(default=1, ge=1, le=1000)
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class BookingOut(BaseModel):
    booking_id: str
    item_id: str
    item_name: str
    start: str
    end: str
    slot: str | None = None
    guests: int
    name: str
    email: str
    phone: str | None = None
    notes: str | None = None
    total_cents: int
    currency: str
    status: BookingStatus
    cta_mode: CtaMode
    created_at: str


def _to_booking(raw: db.Item) -> BookingOut:
    return BookingOut(
        booking_id=raw["booking_id"],
        item_id=raw["item_id"],
        item_name=raw["item_name"],
        start=raw["start"],
        end=raw["end"],
        slot=raw.get("slot"),
        guests=raw["guests"],
        name=raw["name"],
        email=raw["email"],
        phone=raw.get("phone"),
        notes=raw.get("notes"),
        total_cents=raw["total_cents"],
        currency=raw.get("currency", "eur"),
        status=raw["status"],
        cta_mode=raw["cta_mode"],
        created_at=raw["created_at"],
    )


def _counter_ops(
    site_id: str, item: ItemStored, day_keys: list[str], guests: int, sign: int
) -> list[db.Op]:
    """Capacity counter updates. ``sign=+1`` reserves (conditional), ``-1`` releases."""
    if item.type == "PRODUCT" and item.capacity == 0:
        return []
    ops: list[db.Op] = []
    for day_key in day_keys:
        key = {"PK": keys.site(site_id), "SK": f"OCC#{item.item_id}#{day_key}"}
        amount = 1 if item.type == "ROOM" else guests
        if sign > 0:
            limit = 0 if item.type == "ROOM" else item.capacity - guests
            ops.append(
                db.Op(
                    "update",
                    key=key,
                    update="ADD #t :n",
                    condition="attribute_not_exists(#b) AND (attribute_not_exists(#t) OR #t <= :limit)",
                    names={"#t": "taken", "#b": "blocked"},
                    values={":n": amount, ":limit": limit},
                )
            )
        else:
            ops.append(
                db.Op(
                    "update",
                    key=key,
                    update="ADD #t :n",
                    names={"#t": "taken"},
                    values={":n": -amount},
                )
            )
    return ops


def create_booking(
    site_id: str, item: ItemStored, payload: BookingIn, *, status: BookingStatus | None = None
) -> BookingOut:
    if not item.active:
        raise NotFound("Item not found", code="item_not_found")
    if not EMAIL_RE.match(payload.email):
        raise BadRequest("Invalid email", code="invalid_email")
    start = _parse(payload.start)
    if start < date.today():
        raise BadRequest("Date is in the past", code="date_in_past")
    if item.type == "ROOM":
        if not payload.end:
            raise BadRequest("end is required for rooms", code="invalid_range")
        end = _parse(payload.end)
    else:
        end = start + timedelta(days=1)
    if item.type == "EXPERIENCE" and item.slots and payload.slot not in item.slots:
        raise BadRequest("Choose one of the available time slots", code="invalid_slot")
    if payload.slot and item.type != "EXPERIENCE":
        raise BadRequest("Time slots apply to experiences only", code="invalid_slot")

    q, days = quote(site_id, item, start, end, payload.guests, payload.slot)
    if item.type == "ROOM" and payload.guests > max(item.capacity, 1):
        raise BadRequest("Too many guests for this room", code="too_many_guests")
    if not all(d.available for d in days):
        raise Conflict("Not available for the selected dates", code="not_available")

    day_keys = [_day_key(d.day, payload.slot) for d in days]
    booking_id = new_id()
    now = now_iso()
    initial: BookingStatus = status or (
        "PENDING" if item.cta_mode in {"request", "pay"} else "CONFIRMED"
    )
    record: db.Item = {
        "PK": keys.site(site_id),
        "SK": f"{keys.SK_BOOKING}{booking_id}",
        "type": "booking",
        "booking_id": booking_id,
        "item_id": item.item_id,
        "item_name": item.name,
        "start": q.start,
        "end": q.end,
        "slot": payload.slot,
        "guests": payload.guests,
        "name": payload.name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "notes": payload.notes,
        "total_cents": q.total_cents,
        "currency": "eur",
        "status": initial,
        "cta_mode": item.cta_mode,
        "day_keys": day_keys,
        "created_at": now,
        "GSI1PK": f"{keys.site(site_id)}#BOOKINGS",
        "GSI1SK": f"{now}#{booking_id}",
    }
    try:
        db.transact(
            [db.Op("put", item=record), *_counter_ops(site_id, item, day_keys, payload.guests, +1)]
        )
    except Conflict as exc:
        raise Conflict("Not available for the selected dates", code="not_available") from exc
    return _to_booking(record)


def get_booking(site_id: str, booking_id: str) -> db.Item:
    raw = db.get(keys.site(site_id), f"{keys.SK_BOOKING}{booking_id}")
    if not raw:
        raise NotFound("Booking not found", code="booking_not_found")
    return raw


def list_bookings(
    site_id: str, *, limit: int, cursor: str | None
) -> tuple[list[BookingOut], str | None]:
    page = db.query(
        f"{keys.site(site_id)}#BOOKINGS", index="gsi1", limit=limit, cursor=cursor, forward=False
    )
    return [_to_booking(i) for i in page.items], page.next_cursor


def set_booking_status(site_id: str, booking_id: str, status: BookingStatus) -> BookingOut:
    raw = get_booking(site_id, booking_id)
    previous = raw["status"]
    if previous == status:
        return _to_booking(raw)
    if previous == "CANCELLED":
        raise Conflict("A cancelled booking cannot be reopened", code="booking_cancelled")
    ops: list[db.Op] = [
        db.Op(
            "update",
            key={"PK": raw["PK"], "SK": raw["SK"]},
            update="SET #s = :s, updated_at = :u",
            condition="#s = :prev",
            names={"#s": "status"},
            values={":s": status, ":u": now_iso(), ":prev": previous},
        )
    ]
    if status == "CANCELLED":
        item = get_item(site_id, raw["item_id"])
        ops.extend(_counter_ops(site_id, item, raw["day_keys"], raw["guests"], -1))
    db.transact(ops)
    raw["status"] = status
    return _to_booking(raw)


class BlockIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: IsoDate
    end: IsoDate
    blocked: bool = True


def block_days(site_id: str, item: ItemStored, payload: BlockIn) -> int:
    start, end = _parse(payload.start), _parse(payload.end)
    if end <= start or (end - start).days > 90:
        raise BadRequest("Range must be 1-90 days", code="invalid_range")
    ops: list[db.Op] = []
    for day in _days(start, end):
        key = {"PK": keys.site(site_id), "SK": f"OCC#{item.item_id}#{day.isoformat()}"}
        if payload.blocked:
            ops.append(
                db.Op(
                    "update",
                    key=key,
                    update="SET #b = :t",
                    condition="attribute_not_exists(#t) OR #t = :z",
                    names={"#b": "blocked", "#t": "taken"},
                    values={":t": True, ":z": 0},
                )
            )
        else:
            ops.append(db.Op("update", key=key, update="REMOVE #b", names={"#b": "blocked"}))
    try:
        db.transact(ops)
    except Conflict as exc:
        raise Conflict("Some days already have bookings", code="days_booked") from exc
    return len(ops)
