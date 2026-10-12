"""Domain / Origin allow-list matching and normalization."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from monethical.core.errors import BadRequest

_HOST_RE = re.compile(r"^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def normalize_domain(value: str) -> str:
    """Return a bare lowercase host (or ``*.host`` wildcard) or raise BadRequest."""
    raw = value.strip().lower()
    if "://" in raw:
        raw = urlparse(raw).netloc
    raw = raw.split("/")[0].split(":")[0].rstrip(".")
    if raw in _LOCAL_HOSTS or _HOST_RE.match(raw):
        return raw
    raise BadRequest(f"Invalid domain: {value[:80]}", code="invalid_domain")


def host_of(url: str | None) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url)
    except ValueError:
        return ""
    return (parsed.hostname or "").lower()


def host_allowed(host: str, domains: list[str]) -> bool:
    """Exact host match or ``*.example.com`` wildcard (apex included)."""
    if not host:
        return False
    for allowed in domains:
        if allowed == host:
            return True
        if allowed.startswith("*.") and (host == allowed[2:] or host.endswith(allowed[1:])):
            return True
        # ``example.com`` also authorizes ``www.example.com`` (and vice versa)
        if not allowed.startswith("*.") and (f"www.{allowed}" == host or f"www.{host}" == allowed):
            return True
    return False
