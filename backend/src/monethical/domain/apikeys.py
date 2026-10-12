"""Server-to-server secret keys (``sk_live_...``). Stored only as SHA-256 hashes."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from monethical.core import db, keys
from monethical.core.errors import Forbidden, NotFound, Unauthorized
from monethical.core.ids import hash_secret, new_id, new_secret_key, now_iso
from monethical.domain import sites

Scope = Literal["consents:read", "submissions:read", "bookings:read"]
MAX_KEYS_PER_SITE = 5


class KeyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    scopes: list[Scope]


class KeyOut(BaseModel):
    key_id: str
    site_id: str
    label: str
    prefix: str
    scopes: list[str]
    created_at: str
    last_used_at: str | None = None


class KeyCreated(KeyOut):
    secret: str  # shown exactly once


def _to_out(item: db.Item) -> KeyOut:
    return KeyOut(
        key_id=item["key_id"],
        site_id=item["site_id"],
        label=item["label"],
        prefix=item["prefix"],
        scopes=item["scopes"],
        created_at=item["created_at"],
        last_used_at=item.get("last_used_at"),
    )


def list_keys(tenant_id: str, site_id: str) -> list[KeyOut]:
    sites.get_owned_site(tenant_id, site_id)
    items = db.query_all(keys.account(tenant_id), sk_prefix=keys.SK_SECRET, cap=200)
    return [_to_out(i) for i in items if i["site_id"] == site_id]


def create_key(tenant_id: str, site_id: str, payload: KeyCreate) -> KeyCreated:
    sites.get_owned_site(tenant_id, site_id)
    if len(list_keys(tenant_id, site_id)) >= MAX_KEYS_PER_SITE:
        raise Forbidden("Key limit reached for this site", code="key_limit")
    plaintext, hashed, prefix = new_secret_key()
    key_id = new_id()
    now = now_iso()
    record = {
        "PK": keys.account(tenant_id),
        "SK": f"{keys.SK_SECRET}{key_id}",
        "type": "secret_key",
        "key_id": key_id,
        "site_id": site_id,
        "tenant_id": tenant_id,
        "label": payload.label,
        "prefix": prefix,
        "scopes": sorted(set(payload.scopes)),
        "hash": hashed,
        "created_at": now,
    }
    lookup = {
        "PK": keys.secret(hashed),
        "SK": keys.LOOKUP,
        "type": "secret_lookup",
        "tenant_id": tenant_id,
        "site_id": site_id,
        "key_id": key_id,
        "scopes": record["scopes"],
    }
    db.transact([db.Op("put", item=record), db.Op("put", item=lookup)])
    return KeyCreated(**_to_out(record).model_dump(), secret=plaintext)


def revoke_key(tenant_id: str, site_id: str, key_id: str) -> None:
    sites.get_owned_site(tenant_id, site_id)
    record = db.get(keys.account(tenant_id), f"{keys.SK_SECRET}{key_id}")
    if not record or record["site_id"] != site_id:
        raise NotFound("Key not found", code="key_not_found")
    db.transact(
        [
            db.Op("delete", key={"PK": record["PK"], "SK": record["SK"]}),
            db.Op("delete", key={"PK": keys.secret(record["hash"]), "SK": keys.LOOKUP}),
        ]
    )


def rotate_key(tenant_id: str, site_id: str, key_id: str) -> KeyCreated:
    sites.get_owned_site(tenant_id, site_id)
    record = db.get(keys.account(tenant_id), f"{keys.SK_SECRET}{key_id}")
    if not record or record["site_id"] != site_id:
        raise NotFound("Key not found", code="key_not_found")
    revoke_key(tenant_id, site_id, key_id)
    return create_key(tenant_id, site_id, KeyCreate(label=record["label"], scopes=record["scopes"]))


def delete_for_site(tenant_id: str, site_id: str) -> None:
    items = db.query_all(keys.account(tenant_id), sk_prefix=keys.SK_SECRET, cap=200)
    for item in items:
        if item["site_id"] == site_id:
            db.delete(keys.secret(item["hash"]), keys.LOOKUP)
            db.delete(item["PK"], item["SK"])


def authenticate(secret: str | None, *, scope: Scope) -> db.Item:
    """Resolve a bearer secret to its lookup record (tenant, site, scopes)."""
    if not secret or not secret.startswith("sk_live_"):
        raise Unauthorized("Invalid API key", code="invalid_api_key")
    lookup = db.get(keys.secret(hash_secret(secret)), keys.LOOKUP)
    if not lookup:
        raise Unauthorized("Invalid API key", code="invalid_api_key")
    if scope not in lookup["scopes"]:
        raise Forbidden("API key lacks the required scope", code="insufficient_scope")
    return lookup
