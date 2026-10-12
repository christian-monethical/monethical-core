"""Public API guard: site resolution, Origin allow-list, CORS, rate limiting.

Browser requests carry an Origin header the page cannot forge. Non-browser clients can spoof
it, so every public write is additionally rate limited per visitor and validated server side.
"""

from __future__ import annotations

import hmac
import os
import re
from collections.abc import Callable
from typing import Any

from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, Response
from aws_lambda_powertools.event_handler.middlewares import NextMiddleware

from monethical.api.common import error_response, logger
from monethical.core import ratelimit, secrets
from monethical.core.errors import ApiError
from monethical.core.ids import hash_ip
from monethical.core.origin import host_allowed, host_of
from monethical.domain import sites

KEY_PATH = re.compile(r"^/public/(pk_live_[0-9a-f]{32})(/|$)")
MAX_BODY_BYTES = 32 * 1024
WRITES_PER_MINUTE = 20
READS_PER_MINUTE = 240

CORS_ALLOW_HEADERS = "content-type"
CORS_MAX_AGE = "86400"


def client_ip(event: Any) -> str:
    """Viewer IP set by CloudFront (not forgeable by the client); falls back to the socket IP."""
    viewer = event.headers.get("cloudfront-viewer-address") or ""
    if viewer:
        if viewer.startswith("["):  # [ipv6]:port
            return viewer[1 : viewer.index("]")]
        return viewer.rsplit(":", 1)[0] if viewer.count(":") == 1 else viewer
    return str(event.request_context.http.source_ip or "")


def origin_verified(event: Any) -> bool:
    """Reject traffic that bypasses CloudFront when an origin-verify secret is configured."""
    expected = os.environ.get("ORIGIN_VERIFY", "")
    if not expected:
        return True
    return hmac.compare_digest(expected, event.headers.get("x-origin-verify", ""))


def _cors(origin: str) -> dict[str, str | list[str]]:
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
        "Access-Control-Max-Age": CORS_MAX_AGE,
    }


def handle_preflight(event: dict[str, Any]) -> dict[str, Any] | None:
    """Answer CORS preflights without entering the router. Returns None when not a preflight."""
    http = (event.get("requestContext") or {}).get("http") or {}
    if http.get("method") != "OPTIONS":
        return None
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    origin = headers.get("origin", "")
    path = http.get("path", "")
    m = KEY_PATH.match(path)
    lookup = sites.lookup_by_key(m.group(1)) if m else None
    if (
        not lookup
        or lookup.get("status") != "active"
        or not host_allowed(host_of(origin), lookup["domains"])
    ):
        return {"statusCode": 403, "headers": {}, "body": ""}
    return {"statusCode": 204, "headers": _cors(origin), "body": ""}


def oversized(event: dict[str, Any]) -> dict[str, Any] | None:
    """Cheap pre-check before any parsing: reject huge bodies outright."""
    if len(event.get("body") or "") > MAX_BODY_BYTES:
        return {
            "statusCode": 413,
            "headers": {"Content-Type": "application/json"},
            "body": '{"error":{"code":"payload_too_large","message":"Request body too large"}}',
        }
    return None


def guard(app: APIGatewayHttpResolver, next_middleware: NextMiddleware) -> Response[Any]:
    event = app.current_event
    if not origin_verified(event):
        return error_response(403, "forbidden", "Forbidden")
    m = KEY_PATH.match(event.path)
    if not m:  # webhooks, health and legacy adapters do their own checks
        return next_middleware(app)

    lookup = sites.lookup_by_key(m.group(1))
    if not lookup or lookup.get("status") != "active":
        return error_response(404, "site_not_found", "Site not found")

    origin = event.headers.get("origin", "")
    allowed = bool(origin) and host_allowed(host_of(origin), lookup["domains"])
    is_write = event.http_method != "GET"
    if is_write and not allowed:
        logger.warning(
            "blocked origin", extra={"site_id": lookup["site_id"], "origin": origin[:100]}
        )
        return error_response(403, "origin_not_allowed", "Origin not allowed")

    ip = client_ip(event)
    subject = hash_ip(ip, lookup["site_id"], secrets.ip_pepper())[:24]
    try:
        ratelimit.hit(
            "w" if is_write else "r",
            f"{lookup['site_id']}#{subject}",
            limit=WRITES_PER_MINUTE if is_write else READS_PER_MINUTE,
        )
        app.append_context(site=lookup, ip=ip, origin=origin, origin_allowed=allowed)
        response: Response[Any] = next_middleware(app)
    except ApiError as exc:
        response = error_response(exc.status, exc.code, exc.message, exc.details)
    if allowed:
        for name, value in _cors(origin).items():
            response.headers[name] = value  # type: ignore[assignment]
    return response


def with_cors(response: Response[Any], origin: str, allowed: bool) -> Response[Any]:
    if allowed:
        for name, value in _cors(origin).items():
            response.headers[name] = value  # type: ignore[assignment]
    return response


Handler = Callable[..., Any]
