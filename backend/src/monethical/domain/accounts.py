"""Staff-managed customer accounts (Cognito user + profile + plan)."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Any, Literal

import boto3
from botocore.exceptions import ClientError
from pydantic import BaseModel, ConfigDict, StringConstraints

from monethical.core import db, keys, storage
from monethical.core.config import get_settings
from monethical.core.errors import Conflict, NotFound
from monethical.core.ids import now_iso
from monethical.domain import plans, sites
from monethical.domain.forms import Email

AccountStatus = Literal["active", "suspended"]


class AccountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Email
    company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    plan: plans.PlanId = "FREE"


class AccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: plans.PlanId | None = None
    status: AccountStatus | None = None
    company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


class AccountOut(BaseModel):
    tenant_id: str
    email: str
    company: str = ""
    plan: str
    status: AccountStatus
    created_at: str
    stripe_connected: bool = False
    stripe_charges_enabled: bool = False


def to_out(item: db.Item) -> AccountOut:
    return AccountOut(
        tenant_id=item["tenant_id"],
        email=item.get("email", ""),
        company=item.get("company", ""),
        plan=item.get("plan", plans.DEFAULT_PLAN),
        status=item.get("status", "active"),
        created_at=item["created_at"],
        stripe_connected=bool(item.get("stripe_account_id")),
        stripe_charges_enabled=bool(item.get("stripe_charges_enabled")),
    )


@lru_cache(maxsize=1)
def _cognito() -> Any:
    return boto3.client("cognito-idp")


def reset_client() -> None:
    _cognito.cache_clear()


def create_account(payload: AccountCreate) -> db.Item:
    """Invite a customer: Cognito sends the temporary password by email."""
    try:
        res = _cognito().admin_create_user(
            UserPoolId=get_settings().user_pool_id,
            Username=payload.email.lower(),
            UserAttributes=[
                {"Name": "email", "Value": payload.email.lower()},
                {"Name": "email_verified", "Value": "true"},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "UsernameExistsException":
            raise Conflict(
                "An account with this email already exists", code="account_exists"
            ) from exc
        raise
    attrs = {a["Name"]: a["Value"] for a in res["User"]["Attributes"]}
    tenant_id = attrs["sub"]
    now = now_iso()
    profile: db.Item = {
        "PK": keys.account(tenant_id),
        "SK": keys.PROFILE,
        "type": "account",
        "tenant_id": tenant_id,
        "email": payload.email.lower(),
        "company": payload.company,
        "plan": payload.plan,
        "status": "active",
        "created_at": now,
        "GSI1PK": "ACCOUNTS",
        "GSI1SK": f"{now}#{tenant_id}",
    }
    db.put(profile, must_not_exist=True)
    return profile


def list_accounts(*, limit: int, cursor: str | None) -> tuple[list[AccountOut], str | None]:
    page = db.query("ACCOUNTS", index="gsi1", limit=limit, cursor=cursor, forward=False)
    return [to_out(i) for i in page.items], page.next_cursor


def update_account(tenant_id: str, payload: AccountUpdate) -> db.Item:
    pk = keys.account(tenant_id)
    profile = db.get(pk, keys.PROFILE)
    if not profile:
        raise NotFound("Account not found", code="account_not_found")
    changes: dict[str, Any] = {}
    if payload.plan is not None:
        changes["plan"] = payload.plan
    if payload.company is not None:
        changes["company"] = payload.company
    if payload.status is not None:
        changes["status"] = payload.status
    if changes:
        db.update(pk, keys.PROFILE, set_values=changes)
        profile.update(changes)
    if payload.status == "suspended":
        _pause_all_sites(tenant_id)
    return profile


def _pause_all_sites(tenant_id: str) -> None:
    for site in sites.list_sites(tenant_id):
        if site["status"] != "paused":
            site["status"] = "paused"
            site["updated_at"] = now_iso()
            db.transact([db.Op("put", item=site), db.Op("put", item=sites.lookup_item(site))])
        storage.delete_site_snapshots(site["site_key"])
