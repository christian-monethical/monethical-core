"""Outbound email: SQS outbox + SES v2 sender + safe HTML/text rendering."""

from __future__ import annotations

import html
import json
import re
from functools import lru_cache
from typing import Any

import boto3
from aws_lambda_powertools import Logger

from monethical.core.config import get_settings

logger = Logger(child=True)

_CRLF = re.compile(r"[\r\n]+")


@lru_cache(maxsize=1)
def _sqs() -> Any:
    return boto3.client("sqs")


@lru_cache(maxsize=1)
def _ses() -> Any:
    return boto3.client("sesv2", region_name=get_settings().ses_region)


def reset_clients() -> None:
    _sqs.cache_clear()
    _ses.cache_clear()


def one_line(value: str, limit: int = 200) -> str:
    """Make a value safe for an email header: no CR/LF, bounded length."""
    return _CRLF.sub(" ", value).strip()[:limit]


def enqueue(message: dict[str, Any]) -> None:
    """Queue an email job. Messages carry ids only: personal data stays in DynamoDB."""
    queue = get_settings().email_queue_url
    if not queue:
        logger.warning("EMAIL_QUEUE_URL not set: dropping %s", message.get("kind"))
        return
    _sqs().send_message(QueueUrl=queue, MessageBody=json.dumps(message, separators=(",", ":")))


def send(
    *, to: list[str], subject: str, text: str, html_body: str | None, reply_to: str | None
) -> None:
    settings = get_settings()
    body: dict[str, Any] = {"Text": {"Data": text, "Charset": "UTF-8"}}
    if html_body:
        body["Html"] = {"Data": html_body, "Charset": "UTF-8"}
    request: dict[str, Any] = {
        "FromEmailAddress": settings.ses_from,
        "Destination": {"ToAddresses": to},
        "Content": {
            "Simple": {"Subject": {"Data": one_line(subject), "Charset": "UTF-8"}, "Body": body}
        },
    }
    if reply_to:
        request["ReplyToAddresses"] = [one_line(reply_to, 254)]
    _ses().send_email(**request)


def render_form_email(
    site_name: str, form_name: str, rows: list[tuple[str, str]]
) -> tuple[str, str]:
    """Return (text, html) for a form notification. All user values are escaped."""
    text_lines = [f"{label}: {value}" for label, value in rows]
    text = f"{form_name} - {site_name}\n\n" + "\n".join(text_lines) + "\n"
    cells = "".join(
        f'<tr><td style="padding:8px 12px;font-weight:600;vertical-align:top;white-space:nowrap">'
        f"{html.escape(label)}</td>"
        f'<td style="padding:8px 12px;white-space:pre-wrap">{html.escape(value)}</td></tr>'
        for label, value in rows
    )
    body = (
        '<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif">'
        '<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px"><tr><td align="center">'
        '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden">'
        f'<tr><td style="background:#0f172a;color:#fff;padding:18px 20px"><b>{html.escape(form_name)}</b>'
        f'<br><span style="font-size:13px;opacity:.8">{html.escape(site_name)}</span></td></tr>'
        f'<tr><td style="padding:12px"><table width="100%" cellpadding="0" cellspacing="0">{cells}</table></td></tr>'
        '<tr><td style="padding:12px 20px;font-size:12px;color:#6b7280">Sent by Monethical</td></tr>'
        "</table></td></tr></table></body></html>"
    )
    return text, body
