"""Fixed-window rate limiting shared across Lambda instances (DynamoDB atomic counters)."""

from __future__ import annotations

import time

from monethical.core import db
from monethical.core.errors import TooManyRequests


def hit(scope: str, subject: str, *, limit: int, window_s: int = 60) -> None:
    """Count one event for ``subject`` in ``scope``; raise TooManyRequests above ``limit``."""
    now = int(time.time())
    bucket = now // window_s
    item = db.update(
        f"RL#{scope}#{subject}",
        str(bucket),
        add_values={"n": 1},
        set_values={"expires_at": (bucket + 2) * window_s},
        return_new=True,
    )
    if item and int(item.get("n", 0)) > limit:
        raise TooManyRequests("Too many requests, retry shortly")
