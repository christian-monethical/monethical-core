"""Console routes: account, sites, secret keys, analytics, payments onboarding, staff admin."""

from __future__ import annotations

from typing import Annotated

from aws_lambda_powertools.event_handler import Response
from aws_lambda_powertools.event_handler.api_gateway import Router
from aws_lambda_powertools.event_handler.openapi.params import Body, Query
from pydantic import BaseModel

from monethical.api import console_ctx as ctx
from monethical.core import auth, db, keys
from monethical.core.errors import BadRequest
from monethical.core.origin import host_allowed, host_of
from monethical.domain import accounts, analytics, apikeys, payments, plans, sites, snapshots

router = Router()


class MeOut(BaseModel):
    tenant_id: str
    email: str
    is_staff: bool
    plan: str
    plan_name: str
    max_sites: int
    limits: LimitsOut
    stripe_connected: bool
    stripe_charges_enabled: bool


class AccountPage(BaseModel):
    items: list[accounts.AccountOut]
    next_cursor: str | None


class ReturnUrls(BaseModel):
    return_url: str
    refresh_url: str


class UrlOut(BaseModel):
    url: str


class StripeStatusOut(BaseModel):
    connected: bool
    charges_enabled: bool


class LimitsOut(BaseModel):
    max_sites: int
    max_forms_per_site: int
    max_items_per_site: int
    max_surveys_per_site: int


@router.get("/me")
def get_me() -> MeOut:
    p = ctx.principal(router)
    profile = sites.ensure_account(p)
    plan = str(profile.get("plan", "FREE"))
    lim = plans.limits(plan)
    return MeOut(
        tenant_id=p.tenant_id,
        email=p.email,
        is_staff=p.is_staff,
        plan=plan,
        plan_name=lim.display_name,
        max_sites=lim.max_sites,
        limits=LimitsOut(
            max_sites=lim.max_sites,
            max_forms_per_site=lim.max_forms_per_site,
            max_items_per_site=lim.max_items_per_site,
            max_surveys_per_site=lim.max_surveys_per_site,
        ),
        stripe_connected=bool(profile.get("stripe_account_id")),
        stripe_charges_enabled=bool(profile.get("stripe_charges_enabled")),
    )


# ----------------------------------------------------------------------------- sites


@router.get("/sites")
def list_sites() -> list[sites.SiteOut]:
    p = ctx.principal(router)
    ctx.account_plan(p)
    return [sites.to_out(i) for i in sites.list_sites(p.tenant_id)]


@router.post("/sites")
def create_site(payload: Annotated[sites.SiteCreate, Body()]) -> sites.SiteOut:
    p = ctx.principal(router)
    site = sites.create_site(p, payload)
    snapshots.publish(site)
    return sites.to_out(site)


@router.get("/sites/<site_id>")
def get_site(site_id: str) -> sites.SiteOut:
    return sites.to_out(ctx.site_context(router, site_id).site)


@router.patch("/sites/<site_id>")
def update_site(site_id: str, payload: Annotated[sites.SiteUpdate, Body()]) -> sites.SiteOut:
    c = ctx.site_context(router, site_id)
    site = sites.update_site(c.principal, site_id, payload)
    snapshots.publish(site)
    return sites.to_out(site)


@router.delete("/sites/<site_id>")
def delete_site(site_id: str) -> Response[None]:
    c = ctx.site_context(router, site_id)
    sites.delete_site(c.principal, site_id)
    return Response(status_code=204, body=None)


# ----------------------------------------------------------------------------- secret keys


@router.get("/sites/<site_id>/keys")
def list_keys(site_id: str) -> list[apikeys.KeyOut]:
    c = ctx.site_context(router, site_id)
    return apikeys.list_keys(c.principal.tenant_id, site_id)


@router.post("/sites/<site_id>/keys")
def create_key(site_id: str, payload: Annotated[apikeys.KeyCreate, Body()]) -> apikeys.KeyCreated:
    c = ctx.site_context(router, site_id)
    return apikeys.create_key(c.principal.tenant_id, site_id, payload)


@router.post("/sites/<site_id>/keys/<key_id>/rotate")
def rotate_key(site_id: str, key_id: str) -> apikeys.KeyCreated:
    c = ctx.site_context(router, site_id)
    return apikeys.rotate_key(c.principal.tenant_id, site_id, key_id)


@router.delete("/sites/<site_id>/keys/<key_id>")
def revoke_key(site_id: str, key_id: str) -> Response[None]:
    c = ctx.site_context(router, site_id)
    apikeys.revoke_key(c.principal.tenant_id, site_id, key_id)
    return Response(status_code=204, body=None)


# ----------------------------------------------------------------------------- analytics


@router.get("/sites/<site_id>/analytics")
def get_analytics(
    site_id: str, days: Annotated[int, Query(ge=1, le=365)] = 30
) -> analytics.AnalyticsOut:
    c = ctx.site_context(router, site_id)
    return analytics.summary(c.site_id, days)


# ----------------------------------------------------------------------------- stripe connect


def _own_url(url: str, tenant_id: str) -> str:
    """Return URLs only if they point at one of the tenant's own domains (no open redirect)."""
    host = host_of(url)
    allowed: list[str] = []
    for s in sites.list_sites(tenant_id):
        allowed.extend(s["domains"])
    if not url.startswith("https://") or not host_allowed(host, allowed):
        raise BadRequest("URL must be on one of your site domains", code="invalid_return_url")
    return url


@router.post("/stripe/connect")
def stripe_connect(payload: Annotated[ReturnUrls, Body()]) -> UrlOut:
    p = ctx.principal(router)
    ctx.account_plan(p)
    url = payments.onboarding_link(
        p.tenant_id,
        return_url=_own_url(payload.return_url, p.tenant_id),
        refresh_url=_own_url(payload.refresh_url, p.tenant_id),
    )
    return UrlOut(url=url)


@router.get("/stripe/status")
def stripe_status() -> StripeStatusOut:
    p = ctx.principal(router)
    ctx.account_plan(p)
    status = payments.refresh_status(p.tenant_id)
    return StripeStatusOut(
        connected=bool(status["connected"]), charges_enabled=bool(status["charges_enabled"])
    )


# ----------------------------------------------------------------------------- staff admin


@router.get("/admin/accounts")
def admin_list_accounts(
    limit: Annotated[int, Query(ge=1, le=100)] = 50, cursor: Annotated[str | None, Query()] = None
) -> AccountPage:
    auth.require_staff(ctx.principal(router))
    items, nxt = accounts.list_accounts(limit=limit, cursor=cursor)
    return AccountPage(items=items, next_cursor=nxt)


@router.post("/admin/accounts")
def admin_create_account(payload: Annotated[accounts.AccountCreate, Body()]) -> accounts.AccountOut:
    auth.require_staff(ctx.principal(router))
    return accounts.to_out(accounts.create_account(payload))


@router.patch("/admin/accounts/<tenant_id>")
def admin_update_account(
    tenant_id: str, payload: Annotated[accounts.AccountUpdate, Body()]
) -> accounts.AccountOut:
    auth.require_staff(ctx.principal(router))
    return accounts.to_out(accounts.update_account(tenant_id, payload))


@router.get("/admin/accounts/<tenant_id>/sites")
def admin_account_sites(tenant_id: str) -> list[sites.SiteOut]:
    auth.require_staff(ctx.principal(router))
    return [
        sites.to_out(i)
        for i in db.query_all(keys.account(tenant_id), sk_prefix=keys.SK_SITE, cap=200)
    ]
