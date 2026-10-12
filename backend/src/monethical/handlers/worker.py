"""Lambda entrypoint: SQS email worker (form notifications, autoresponders, booking mails)."""

from __future__ import annotations

import json
from typing import Any

from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
from aws_lambda_powertools.utilities.typing import LambdaContext

from monethical.api.common import logger
from monethical.core import db, emailing, keys
from monethical.domain import catalog, forms

processor = BatchProcessor(event_type=EventType.SQS)


def _send_form_submission(site_id: str, submission_id: str, site_name: str) -> None:
    sub = db.get(keys.site(site_id), f"{keys.SK_SUBMISSION}{submission_id}")
    if not sub:
        logger.warning("submission vanished", extra={"submission_id": submission_id})
        return
    form = forms.get_form(site_id, sub["form_id"])
    labels = {f.key: f.label for f in form.fields}
    data = sub["data"]
    rows = [
        (labels.get(k, k), "yes" if v is True else "no" if v is False else str(v))
        for k, v in data.items()
    ]
    text, html_body = emailing.render_form_email(site_name, form.name, rows)
    subject = emailing.one_line(form.subject or f"{form.name} - {site_name}")
    emailing.send(
        to=form.recipients,
        subject=subject,
        text=text,
        html_body=html_body,
        reply_to=forms.reply_to(form, data),
    )
    auto = form.autoresponder
    customer = forms.reply_to(form, data)
    if auto.enabled and customer:
        emailing.send(
            to=[customer],
            subject=auto.subject,
            text=auto.body,
            html_body=None,
            reply_to=form.recipients[0],
        )


def _send_booking_created(site_id: str, tenant_id: str, booking_id: str, site_name: str) -> None:
    raw = catalog.get_booking(site_id, booking_id)
    rows = [
        ("Item", raw["item_name"]),
        ("From", raw["start"]),
        ("To", raw["end"]),
        ("Guests", str(raw["guests"])),
        ("Name", raw["name"]),
        ("Email", raw["email"]),
        ("Phone", raw.get("phone", "")),
        ("Notes", raw.get("notes", "")),
        ("Total", f"{raw['total_cents'] / 100:.2f} EUR"),
        ("Status", raw["status"]),
    ]
    text, html_body = emailing.render_form_email(site_name, "Booking", rows)
    owner = db.get(keys.account(tenant_id), keys.PROFILE) or {}
    emailing.send(
        to=[raw["email"]],
        subject=f"Your booking - {site_name}",
        text=text,
        html_body=html_body,
        reply_to=owner.get("email") or None,
    )
    if owner.get("email"):
        emailing.send(
            to=[owner["email"]],
            subject=f"New booking: {raw['item_name']} - {site_name}",
            text=text,
            html_body=html_body,
            reply_to=raw["email"],
        )


def _record_handler(record: SQSRecord) -> None:
    message: dict[str, Any] = json.loads(record.body)
    kind = message.get("kind")
    site_id = str(message["site_id"])
    site_name = str(message.get("site_name", ""))
    if kind == "form_submission":
        _send_form_submission(site_id, str(message["submission_id"]), site_name)
    elif kind == "booking_created":
        _send_booking_created(
            site_id, str(message["tenant_id"]), str(message["booking_id"]), site_name
        )
    else:
        logger.warning("unknown message kind", extra={"kind": kind})


@logger.inject_lambda_context
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    result: dict[str, Any] = dict(
        process_partial_response(
            event=event, record_handler=_record_handler, processor=processor, context=context
        )
    )
    return result
