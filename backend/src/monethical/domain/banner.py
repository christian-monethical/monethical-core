"""Cookie-consent banner: configuration and consent log (GDPR / Consent Mode v2)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from monethical.core import db, keys
from monethical.core.errors import BadRequest
from monethical.core.ids import hash_ip, mask_ip, new_id, now_iso
from monethical.domain.styles import HttpsUrl, LongText, MediumText, ShortText, Surface

Layout = Literal["bar-bottom", "bar-top", "card-left", "card-right", "modal"]
Category = Literal["necessary", "preferences", "analytics", "marketing"]
_ALL_CATEGORIES: tuple[Category, ...] = ("necessary", "preferences", "analytics", "marketing")
CONSENT_TTL_DAYS = 365 * 5  # consent proof kept five years, then expired by DynamoDB TTL


class BannerTexts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText = "We value your privacy"
    body: LongText = (
        "We use cookies to make the site work, to measure traffic and, with your consent, "
        "for marketing. You can change your choice at any time."
    )
    accept_all: ShortText = "Accept all"
    reject_all: ShortText = "Only necessary"
    customize: ShortText = "Customize"
    save: ShortText = "Save choices"
    privacy_link_label: ShortText = "Privacy policy"
    reopen_label: ShortText = "Cookie settings"
    necessary_label: ShortText = "Necessary"
    necessary_description: MediumText = "Required for the site to function. Always on."
    preferences_label: ShortText = "Preferences"
    preferences_description: MediumText = "Remember your settings such as language."
    analytics_label: ShortText = "Analytics"
    analytics_description: MediumText = "Help us understand how the site is used."
    marketing_label: ShortText = "Marketing"
    marketing_description: MediumText = "Used to show relevant offers."


class BannerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    layout: Layout = "bar-bottom"
    language: Annotated[str, StringConstraints(pattern=r"^[a-z]{2}(-[A-Z]{2})?$")] = "it"
    surface: Surface = Field(default_factory=Surface)
    texts: BannerTexts = Field(default_factory=BannerTexts)
    logo_url: HttpsUrl | None = None
    privacy_url: HttpsUrl | None = None
    categories: list[Category] = Field(default_factory=lambda: list(_ALL_CATEGORIES), max_length=4)
    show_reopen_badge: bool = True
    consent_expiry_days: int = Field(default=180, ge=1, le=395)
    google_consent_mode: bool = True


class BannerStored(BannerConfig):
    version: int = 1
    updated_at: str = ""


def _item_to_config(item: db.Item) -> BannerStored:
    data = {k: v for k, v in item.items() if k not in {"PK", "SK", "type"}}
    return BannerStored.model_validate(data)


def get_config(site_id: str) -> BannerStored:
    item = db.get(keys.site(site_id), keys.SK_BANNER)
    if not item:
        return BannerStored(version=0)
    return _item_to_config(item)


def save_config(site_id: str, config: BannerConfig) -> BannerStored:
    if "necessary" not in config.categories:
        raise BadRequest("The 'necessary' category cannot be removed", code="invalid_categories")
    current = db.get(keys.site(site_id), keys.SK_BANNER)
    version = int(current["version"]) + 1 if current else 1
    stored = BannerStored(**config.model_dump(), version=version, updated_at=now_iso())
    db.put(
        {"PK": keys.site(site_id), "SK": keys.SK_BANNER, "type": "banner", **stored.model_dump()}
    )
    return stored


# ----------------------------------------------------------------------------- consent log


class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    banner_version: int = Field(ge=0, le=100000)
    preferences: bool = False
    analytics: bool = False
    marketing: bool = False
    visitor_id: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{8,64}$")] | None = None


class ConsentOut(BaseModel):
    consent_id: str
    created_at: str
    banner_version: int
    necessary: bool = True
    preferences: bool
    analytics: bool
    marketing: bool
    ip_prefix: str | None = None
    user_agent: str | None = None
    visitor_id: str | None = None


def record_consent(
    site_id: str, payload: ConsentIn, *, ip: str, user_agent: str, pepper: str, now_epoch: int
) -> str:
    consent_id = new_id()
    created = now_iso()
    item: db.Item = {
        "PK": keys.site(site_id),
        "SK": f"{keys.SK_CONSENT}{consent_id}",
        "type": "consent",
        "consent_id": consent_id,
        "created_at": created,
        "banner_version": payload.banner_version,
        "preferences": payload.preferences,
        "analytics": payload.analytics,
        "marketing": payload.marketing,
        "ip_prefix": mask_ip(ip),
        "ip_hash": hash_ip(ip, site_id, pepper),
        "user_agent": user_agent[:300],
        "visitor_id": payload.visitor_id,
        "expires_at": now_epoch + CONSENT_TTL_DAYS * 86400,
    }
    db.put(item)
    return consent_id


def list_consents(
    site_id: str, *, limit: int, cursor: str | None
) -> tuple[list[ConsentOut], str | None]:
    page = db.query(
        keys.site(site_id), sk_prefix=keys.SK_CONSENT, limit=limit, cursor=cursor, forward=False
    )
    out = [
        ConsentOut(
            consent_id=i["consent_id"],
            created_at=i["created_at"],
            banner_version=i["banner_version"],
            preferences=i["preferences"],
            analytics=i["analytics"],
            marketing=i["marketing"],
            ip_prefix=i.get("ip_prefix"),
            user_agent=i.get("user_agent"),
            visitor_id=i.get("visitor_id"),
        )
        for i in page.items
    ]
    return out, page.next_cursor
