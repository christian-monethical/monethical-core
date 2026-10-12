"""Per-request context for console routes: who is calling and which site they may touch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from aws_lambda_powertools.event_handler.api_gateway import Router

from monethical.core import db
from monethical.core.auth import Principal, principal_from_claims
from monethical.core.errors import Forbidden
from monethical.domain import sites, snapshots


@dataclass(frozen=True, slots=True)
class SiteContext:
    principal: Principal
    site: db.Item
    plan: str

    @property
    def site_id(self) -> str:
        return str(self.site["site_id"])

    def publish(self) -> None:
        """Refresh the public CDN snapshot after a write."""
        snapshots.publish(self.site)


def principal(router: Router) -> Principal:
    claims: dict[str, Any] | None = None
    try:
        event: Any = router.current_event
        claims = event.request_context.authorizer.jwt_claim
    except (AttributeError, KeyError):
        claims = None
    return principal_from_claims(claims)


def account_plan(p: Principal) -> tuple[str, str]:
    profile = sites.ensure_account(p)
    if profile.get("status") != "active":
        raise Forbidden("Account suspended", code="account_suspended")
    return str(profile.get("plan", "FREE")), str(profile.get("status"))


def site_context(router: Router, site_id: str) -> SiteContext:
    """The only way a console route reaches site data: ownership is verified here."""
    p = principal(router)
    plan, _ = account_plan(p)
    site = sites.get_owned_site(p.tenant_id, site_id)
    return SiteContext(principal=p, site=site, plan=plan)
