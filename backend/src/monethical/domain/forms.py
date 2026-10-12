"""Contact forms: configuration, validation of visitor submissions and storage."""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from monethical.core import db, keys
from monethical.core.errors import BadRequest, Forbidden, NotFound
from monethical.core.ids import hash_ip, new_id, now_iso
from monethical.domain import plans
from monethical.domain.styles import LongText, MediumText, ShortText, Surface

FieldType = Literal["text", "email", "tel", "textarea", "select", "checkbox"]
SUBMISSION_TTL_DAYS = 730

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-']+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$")
Email = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=254, pattern=EMAIL_RE.pattern)
]
FieldKey = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,31}$")]


class FormField(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: FieldKey
    label: ShortText
    type: FieldType = "text"
    required: bool = False
    placeholder: ShortText | None = None
    options: list[ShortText] = Field(default_factory=list, max_length=20)
    max_length: int = Field(default=500, ge=1, le=5000)


class Autoresponder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    subject: ShortText = "We received your message"
    body: LongText = "Thank you for contacting us. We will get back to you shortly."


def _default_fields() -> list[FormField]:
    return [
        FormField(key="name", label="Name", type="text", required=True, max_length=120),
        FormField(key="email", label="Email", type="email", required=True, max_length=254),
        FormField(key="phone", label="Phone", type="tel", required=False, max_length=50),
        FormField(key="message", label="Message", type="textarea", required=True, max_length=3000),
    ]


class FormConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ShortText = "Contact form"
    enabled: bool = True
    fields: list[FormField] = Field(default_factory=_default_fields, min_length=1, max_length=20)
    recipients: list[Email] = Field(min_length=1, max_length=10)
    subject: ShortText = ""
    submit_label: ShortText = "Send"
    success_message: MediumText = "Thank you! We will reply as soon as possible."
    privacy_text: MediumText = ""
    privacy_required: bool = False
    privacy_url: str | None = Field(default=None, max_length=500, pattern=r"^https://[^\s\"'<>]+$")
    autoresponder: Autoresponder = Field(default_factory=Autoresponder)
    surface: Surface = Field(default_factory=Surface)


class FormStored(FormConfig):
    form_id: str
    created_at: str
    updated_at: str


def _validate_config(config: FormConfig) -> None:
    seen: set[str] = set()
    for f in config.fields:
        if f.key in seen:
            raise BadRequest(f"Duplicate field key '{f.key}'", code="duplicate_field")
        seen.add(f.key)
        if f.type == "select" and not f.options:
            raise BadRequest(f"Field '{f.key}' needs options", code="missing_options")
    if config.autoresponder.enabled and not any(f.type == "email" for f in config.fields):
        raise BadRequest("Autoresponder requires an email field", code="autoresponder_needs_email")


def _to_stored(item: db.Item) -> FormStored:
    return FormStored.model_validate(
        {k: v for k, v in item.items() if k not in {"PK", "SK", "type"}}
    )


def list_forms(site_id: str) -> list[FormStored]:
    return [
        _to_stored(i) for i in db.query_all(keys.site(site_id), sk_prefix=keys.SK_FORM, cap=100)
    ]


def get_form(site_id: str, form_id: str) -> FormStored:
    item = db.get(keys.site(site_id), f"{keys.SK_FORM}{form_id}")
    if not item:
        raise NotFound("Form not found", code="form_not_found")
    return _to_stored(item)


def create_form(site_id: str, plan: str, config: FormConfig) -> FormStored:
    _validate_config(config)
    if len(list_forms(site_id)) >= plans.limits(plan).max_forms_per_site:
        raise Forbidden("Form limit reached for your plan", code="plan_limit")
    now = now_iso()
    form_id = new_id()
    stored = FormStored(**config.model_dump(), form_id=form_id, created_at=now, updated_at=now)
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_FORM}{form_id}",
            "type": "form",
            **stored.model_dump(),
        }
    )
    return stored


def update_form(site_id: str, form_id: str, config: FormConfig) -> FormStored:
    _validate_config(config)
    existing = get_form(site_id, form_id)
    stored = FormStored(
        **config.model_dump(), form_id=form_id, created_at=existing.created_at, updated_at=now_iso()
    )
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_FORM}{form_id}",
            "type": "form",
            **stored.model_dump(),
        }
    )
    return stored


def delete_form(site_id: str, form_id: str) -> None:
    get_form(site_id, form_id)
    db.delete(keys.site(site_id), f"{keys.SK_FORM}{form_id}")


def public_view(form: FormStored) -> dict[str, Any]:
    """What visitors may see: never recipients or autoresponder text."""
    return {
        "form_id": form.form_id,
        "name": form.name,
        "fields": [f.model_dump(exclude_none=True) for f in form.fields],
        "submit_label": form.submit_label,
        "success_message": form.success_message,
        "privacy_text": form.privacy_text,
        "privacy_required": form.privacy_required,
        "privacy_url": form.privacy_url,
        "surface": form.surface.model_dump(),
    }


# ----------------------------------------------------------------------------- submissions

HONEYPOT = "website"


class InvalidSubmission(BadRequest):
    code = "invalid_submission"


def validate_submission(form: FormStored, raw: dict[str, Any]) -> dict[str, Any]:
    """Return clean, typed values for the form's own fields; raise on any violation."""
    clean: dict[str, Any] = {}
    errors: dict[str, str] = {}
    for f in form.fields:
        value = raw.get(f.key)
        if f.type == "checkbox":
            checked = value is True or value in ("true", "on", "1", 1)
            if f.required and not checked:
                errors[f.key] = "required"
            clean[f.key] = checked
            continue
        text = "" if value is None else str(value).strip()
        if not text:
            if f.required:
                errors[f.key] = "required"
            continue
        if len(text) > f.max_length:
            errors[f.key] = "too_long"
        elif f.type == "email" and not EMAIL_RE.match(text):
            errors[f.key] = "invalid_email"
        elif f.type == "tel" and not re.fullmatch(r"[0-9+\s().\-]{5,50}", text):
            errors[f.key] = "invalid_phone"
        elif f.type == "select" and text not in f.options:
            errors[f.key] = "invalid_option"
        elif "\x00" in text:
            errors[f.key] = "invalid_characters"
        else:
            clean[f.key] = text
    if form.privacy_required and raw.get("privacy") not in (True, "true", "on", "1", 1):
        errors["privacy"] = "required"
    if errors:
        raise InvalidSubmission(
            "Validation failed: " + ", ".join(f"{k}:{v}" for k, v in errors.items())
        )
    return clean


def store_submission(
    site_id: str, form: FormStored, data: dict[str, Any], *, ip: str, pepper: str, now_epoch: int
) -> str:
    sub_id = new_id()
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_SUBMISSION}{sub_id}",
            "type": "submission",
            "submission_id": sub_id,
            "form_id": form.form_id,
            "form_name": form.name,
            "data": data,
            "created_at": now_iso(),
            "ip_hash": hash_ip(ip, site_id, pepper),
            "status": "new",
            "expires_at": now_epoch + SUBMISSION_TTL_DAYS * 86400,
        }
    )
    return sub_id


def reply_to(form: FormStored, data: dict[str, Any]) -> str | None:
    for f in form.fields:
        if f.type == "email" and data.get(f.key):
            return str(data[f.key])
    return None


class SubmissionOut(BaseModel):
    submission_id: str
    form_id: str
    form_name: str
    created_at: str
    status: Literal["new", "read", "archived"]
    data: dict[str, Any]


def list_submissions(
    site_id: str, *, limit: int, cursor: str | None
) -> tuple[list[SubmissionOut], str | None]:
    page = db.query(
        keys.site(site_id), sk_prefix=keys.SK_SUBMISSION, limit=limit, cursor=cursor, forward=False
    )
    return [
        SubmissionOut(
            submission_id=i["submission_id"],
            form_id=i["form_id"],
            form_name=i.get("form_name", ""),
            created_at=i["created_at"],
            status=i.get("status", "new"),
            data=i.get("data", {}),
        )
        for i in page.items
    ], page.next_cursor


def set_submission_status(
    site_id: str, submission_id: str, status: Literal["new", "read", "archived"]
) -> None:
    db.update(
        keys.site(site_id),
        f"{keys.SK_SUBMISSION}{submission_id}",
        set_values={"status": status},
        condition="attribute_exists(PK)",
    )


def delete_submission(site_id: str, submission_id: str) -> None:
    db.delete(keys.site(site_id), f"{keys.SK_SUBMISSION}{submission_id}")
