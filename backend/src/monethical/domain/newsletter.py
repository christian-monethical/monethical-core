"""Newsletter signup widget: configuration and double-opt-in-ready subscriber list."""

from __future__ import annotations

import hashlib
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from monethical.core import db, keys
from monethical.core.ids import now_iso
from monethical.domain.forms import EMAIL_RE, Email
from monethical.domain.styles import MediumText, ShortText, Surface

SubscriberStatus = Literal["subscribed", "unsubscribed"]


class NewsletterConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    headline: ShortText = "Subscribe to our newsletter"
    subheadline: MediumText = "News and offers, no spam."
    button_label: ShortText = "Subscribe"
    email_placeholder: ShortText = "Your email"
    privacy_text: MediumText = "I agree to receive the newsletter."
    privacy_url: str | None = Field(default=None, max_length=500, pattern=r"^https://[^\s\"'<>]+$")
    success_message: MediumText = "Thanks for subscribing!"
    surface: Surface = Field(default_factory=Surface)


class SubscribeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Email
    consent: bool


class SubscriberOut(BaseModel):
    email: str
    status: SubscriberStatus
    created_at: str


def get_config(site_id: str) -> NewsletterConfig:
    item = db.get(keys.site(site_id), keys.SK_NEWSLETTER_CFG)
    if not item:
        return NewsletterConfig()
    return NewsletterConfig.model_validate(
        {k: v for k, v in item.items() if k not in {"PK", "SK", "type"}}
    )


def save_config(site_id: str, config: NewsletterConfig) -> NewsletterConfig:
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": keys.SK_NEWSLETTER_CFG,
            "type": "newsletter",
            **config.model_dump(),
        }
    )
    return config


def public_view(site_id: str) -> dict[str, Any] | None:
    cfg = get_config(site_id)
    return cfg.model_dump() if cfg.enabled else None


def _email_hash(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()[:40]


def subscribe(site_id: str, payload: SubscribeIn, *, ip_prefix: str) -> None:
    """Idempotent: re-subscribing an existing address just refreshes the record."""
    email = payload.email.lower()
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_SUBSCRIBER}{_email_hash(email)}",
            "type": "subscriber",
            "email": email,
            "status": "subscribed",
            "consent_at": now_iso(),
            "created_at": now_iso(),
            "ip_prefix": ip_prefix,
        }
    )


def unsubscribe(site_id: str, email: str) -> None:
    if not EMAIL_RE.match(email):
        return
    db.update(
        keys.site(site_id),
        f"{keys.SK_SUBSCRIBER}{_email_hash(email)}",
        set_values={"status": "unsubscribed", "unsubscribed_at": now_iso()},
        condition="attribute_exists(PK)",
    )


def list_subscribers(
    site_id: str, *, limit: int, cursor: str | None
) -> tuple[list[SubscriberOut], str | None]:
    page = db.query(keys.site(site_id), sk_prefix=keys.SK_SUBSCRIBER, limit=limit, cursor=cursor)
    return [
        SubscriberOut(email=i["email"], status=i["status"], created_at=i["created_at"])
        for i in page.items
    ], page.next_cursor
