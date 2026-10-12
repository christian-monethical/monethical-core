"""Accounts and sites. A tenant (Cognito user) owns many sites; everything else hangs off a site."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from monethical.core import db, keys, storage
from monethical.core.auth import Principal
from monethical.core.errors import Conflict, Forbidden, NotFound
from monethical.core.ids import new_id, new_site_key, now_iso
from monethical.core.origin import normalize_domain
from monethical.domain import plans

SiteStatus = Literal["active", "paused"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class SiteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    domains: list[Annotated[str, StringConstraints(max_length=253)]] = Field(
        min_length=1, max_length=10
    )


class SiteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name | None = None
    domains: list[Annotated[str, StringConstraints(max_length=253)]] | None = Field(
        default=None, min_length=1, max_length=10
    )
    status: SiteStatus | None = None


class SiteOut(BaseModel):
    site_id: str
    name: str
    site_key: str
    domains: list[str]
    status: SiteStatus
    created_at: str
    updated_at: str


def to_out(item: db.Item) -> SiteOut:
    return SiteOut(
        site_id=item["site_id"],
        name=item["name"],
        site_key=item["site_key"],
        domains=item["domains"],
        status=item["status"],
        created_at=item["created_at"],
        updated_at=item["updated_at"],
    )


# ----------------------------------------------------------------------------- accounts


def ensure_account(principal: Principal) -> db.Item:
    pk = keys.account(principal.tenant_id)
    profile = db.get(pk, keys.PROFILE)
    if profile:
        return profile
    profile = {
        "PK": pk,
        "SK": keys.PROFILE,
        "type": "account",
        "tenant_id": principal.tenant_id,
        "email": principal.email,
        "plan": plans.DEFAULT_PLAN,
        "status": "active",
        "created_at": now_iso(),
    }
    profile["GSI1PK"] = "ACCOUNTS"
    profile["GSI1SK"] = f"{profile['created_at']}#{principal.tenant_id}"
    try:
        db.put(profile, must_not_exist=True)
    except Conflict:  # concurrent first request
        return db.get(pk, keys.PROFILE, consistent=True) or profile
    return profile


# ----------------------------------------------------------------------------- sites


def list_sites(tenant_id: str) -> list[db.Item]:
    return db.query_all(keys.account(tenant_id), sk_prefix=keys.SK_SITE, cap=200)


def get_owned_site(tenant_id: str, site_id: str) -> db.Item:
    """Load a site only if the tenant owns it. Missing and foreign sites look identical."""
    item = db.get(keys.account(tenant_id), f"{keys.SK_SITE}{site_id}")
    if not item:
        raise NotFound("Site not found", code="site_not_found")
    return item


def lookup_item(site: db.Item) -> db.Item:
    return {
        "PK": keys.site_key(site["site_key"]),
        "SK": keys.LOOKUP,
        "type": "site_lookup",
        "site_id": site["site_id"],
        "tenant_id": site["tenant_id"],
        "name": site["name"],
        "domains": site["domains"],
        "status": site["status"],
    }


def _normalize_domains(raw: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for value in raw:
        seen[normalize_domain(value)] = None
    return list(seen)


def create_site(principal: Principal, payload: SiteCreate) -> db.Item:
    profile = ensure_account(principal)
    if profile.get("status") != "active":
        raise Forbidden("Account suspended", code="account_suspended")
    limit = plans.limits(profile.get("plan", plans.DEFAULT_PLAN)).max_sites
    if len(list_sites(principal.tenant_id)) >= limit:
        raise Forbidden("Site limit reached for your plan", code="plan_limit")

    domains = _normalize_domains(payload.domains)
    now = now_iso()
    site: db.Item = {
        "PK": keys.account(principal.tenant_id),
        "SK": f"{keys.SK_SITE}{new_id()}",
        "type": "site",
        "tenant_id": principal.tenant_id,
        "name": payload.name,
        "site_key": new_site_key(),
        "domains": domains,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    site["site_id"] = site["SK"].removeprefix(keys.SK_SITE)
    ops = [
        db.Op("put", item=site, condition="attribute_not_exists(PK)"),
        db.Op("put", item=lookup_item(site), condition="attribute_not_exists(PK)"),
        *[
            db.Op(
                "put",
                item={
                    "PK": keys.domain(d),
                    "SK": keys.LOOKUP,
                    "type": "domain",
                    "site_id": site["site_id"],
                    "site_key": site["site_key"],
                },
                condition="attribute_not_exists(PK)",
            )
            for d in domains
        ],
    ]
    try:
        db.transact(ops)
    except Conflict as exc:
        raise Conflict(
            "A domain is already registered on another site", code="domain_taken"
        ) from exc
    return site


def update_site(principal: Principal, site_id: str, payload: SiteUpdate) -> db.Item:
    site = get_owned_site(principal.tenant_id, site_id)
    ops: list[db.Op] = []
    if payload.name is not None:
        site["name"] = payload.name
    if payload.status is not None:
        site["status"] = payload.status
    if payload.domains is not None:
        new_domains = _normalize_domains(payload.domains)
        old = set(site["domains"])
        for d in old - set(new_domains):
            ops.append(db.Op("delete", key={"PK": keys.domain(d), "SK": keys.LOOKUP}))
        for d in set(new_domains) - old:
            ops.append(
                db.Op(
                    "put",
                    item={
                        "PK": keys.domain(d),
                        "SK": keys.LOOKUP,
                        "type": "domain",
                        "site_id": site_id,
                        "site_key": site["site_key"],
                    },
                    condition="attribute_not_exists(PK)",
                )
            )
        site["domains"] = new_domains
    site["updated_at"] = now_iso()
    ops.append(db.Op("put", item=site, condition="attribute_exists(PK)"))
    ops.append(db.Op("put", item=lookup_item(site)))
    try:
        db.transact(ops)
    except Conflict as exc:
        raise Conflict(
            "A domain is already registered on another site", code="domain_taken"
        ) from exc
    return site


def delete_site(principal: Principal, site_id: str) -> None:
    from monethical.domain import apikeys  # local import: apikeys depends on sites

    site = get_owned_site(principal.tenant_id, site_id)
    apikeys.delete_for_site(principal.tenant_id, site_id)
    db.delete_partition(keys.site(site_id))
    for d in site["domains"]:
        db.delete(keys.domain(d), keys.LOOKUP)
    db.delete(keys.site_key(site["site_key"]), keys.LOOKUP)
    db.delete(site["PK"], site["SK"])
    storage.delete_site_snapshots(site["site_key"])


# ----------------------------------------------------------------------------- public lookups


def lookup_by_key(site_key: str) -> db.Item | None:
    """Resolve a public site key (one GetItem)."""
    if not site_key.startswith("pk_live_") or len(site_key) != 40:
        return None
    return db.get(keys.site_key(site_key), keys.LOOKUP)


def lookup_by_host(host: str) -> db.Item | None:
    """Resolve a customer hostname to its site lookup (legacy adapters)."""
    for candidate in dict.fromkeys(
        [host, host.removeprefix("www."), f"www.{host.removeprefix('www.')}"]
    ):
        domain = db.get(keys.domain(candidate), keys.LOOKUP)
        if domain:
            return lookup_by_key(domain["site_key"])
    return None
