"""Privacy-friendly aggregate counters (no per-visitor tracking)."""

from __future__ import annotations

import time
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel

from monethical.core import db, keys

Metric = Literal[
    "consent_total",
    "consent_analytics",
    "consent_marketing",
    "form_submissions",
    "newsletter_signups",
    "survey_responses",
    "bookings",
]
METRICS: tuple[str, ...] = (
    "consent_total",
    "consent_analytics",
    "consent_marketing",
    "form_submissions",
    "newsletter_signups",
    "survey_responses",
    "bookings",
)
RETENTION_DAYS = 800


def incr(site_id: str, metric: Metric, amount: int = 1) -> None:
    today = datetime.now(UTC).date().isoformat()
    db.update(
        keys.site(site_id),
        f"{keys.SK_STAT}{today}",
        add_values={metric: amount},
        set_values={"expires_at": int(time.time()) + RETENTION_DAYS * 86400},
    )


class AnalyticsPoint(BaseModel):
    day: str
    consent_total: int = 0
    consent_analytics: int = 0
    consent_marketing: int = 0
    form_submissions: int = 0
    newsletter_signups: int = 0
    survey_responses: int = 0
    bookings: int = 0


class AnalyticsTotals(BaseModel):
    consent_total: int = 0
    consent_analytics: int = 0
    consent_marketing: int = 0
    form_submissions: int = 0
    newsletter_signups: int = 0
    survey_responses: int = 0
    bookings: int = 0


class AnalyticsOut(BaseModel):
    days: int
    totals: AnalyticsTotals
    series: list[AnalyticsPoint]


def summary(site_id: str, days: int = 30) -> AnalyticsOut:
    days = max(1, min(days, 365))
    end = datetime.now(UTC).date()
    start = end - timedelta(days=days - 1)
    page = db.query(
        keys.site(site_id),
        sk_between=(f"{keys.SK_STAT}{start.isoformat()}", f"{keys.SK_STAT}{end.isoformat()}"),
        limit=100,
    )
    items = list(page.items)
    cursor = page.next_cursor
    while cursor:
        more = db.query(
            keys.site(site_id),
            sk_between=(f"{keys.SK_STAT}{start.isoformat()}", f"{keys.SK_STAT}{end.isoformat()}"),
            limit=100,
            cursor=cursor,
        )
        items.extend(more.items)
        cursor = more.next_cursor
    by_day = {i["SK"].removeprefix(keys.SK_STAT): i for i in items}
    series: list[dict[str, Any]] = []
    totals = dict.fromkeys(METRICS, 0)
    for n in range(days):
        day: date = start + timedelta(days=n)
        row = by_day.get(day.isoformat(), {})
        point: dict[str, Any] = {"day": day.isoformat()}
        for m in METRICS:
            value = int(row.get(m, 0))
            point[m] = value
            totals[m] += value
        series.append(point)
    return AnalyticsOut(
        days=days,
        totals=AnalyticsTotals(**totals),
        series=[AnalyticsPoint(**point) for point in series],
    )
