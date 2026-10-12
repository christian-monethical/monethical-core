"""Console routes for the per-site modules: banner, forms, newsletter, surveys, catalog."""

from __future__ import annotations

import csv
import io
from typing import Annotated, Any, Literal

from aws_lambda_powertools.event_handler import Response
from aws_lambda_powertools.event_handler.api_gateway import Router
from aws_lambda_powertools.event_handler.openapi.params import Body, Query
from pydantic import BaseModel

from monethical.api import console_ctx as ctx
from monethical.domain import banner, catalog, forms, newsletter, surveys

router = Router()

Limit = Annotated[int, Query(ge=1, le=100)]
Cursor = Annotated[str | None, Query()]


class ConsentPage(BaseModel):
    items: list[banner.ConsentOut]
    next_cursor: str | None


class SubmissionPage(BaseModel):
    items: list[forms.SubmissionOut]
    next_cursor: str | None


class SubscriberPage(BaseModel):
    items: list[newsletter.SubscriberOut]
    next_cursor: str | None


class BookingPage(BaseModel):
    items: list[catalog.BookingOut]
    next_cursor: str | None


class StatusIn(BaseModel):
    status: Literal["new", "read", "archived"]


class BookingStatusIn(BaseModel):
    status: catalog.BookingStatus


class OkOut(BaseModel):
    ok: bool = True


# ----------------------------------------------------------------------------- banner


@router.get("/sites/<site_id>/banner")
def get_banner(site_id: str) -> banner.BannerStored:
    return banner.get_config(ctx.site_context(router, site_id).site_id)


@router.put("/sites/<site_id>/banner")
def put_banner(
    site_id: str, payload: Annotated[banner.BannerConfig, Body()]
) -> banner.BannerStored:
    c = ctx.site_context(router, site_id)
    stored = banner.save_config(c.site_id, payload)
    c.publish()
    return stored


@router.get("/sites/<site_id>/consents")
def list_consents(site_id: str, limit: Limit = 50, cursor: Cursor = None) -> ConsentPage:
    c = ctx.site_context(router, site_id)
    items, nxt = banner.list_consents(c.site_id, limit=limit, cursor=cursor)
    return ConsentPage(items=items, next_cursor=nxt)


@router.get("/sites/<site_id>/consents.csv")
def export_consents(site_id: str) -> Response[str]:
    """CSV of the latest 5000 consents (proof of consent export)."""
    c = ctx.site_context(router, site_id)
    rows: list[banner.ConsentOut] = []
    cursor: str | None = None
    while len(rows) < 5000:
        page, cursor = banner.list_consents(c.site_id, limit=100, cursor=cursor)
        rows.extend(page)
        if not cursor:
            break
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "consent_id",
            "created_at",
            "banner_version",
            "preferences",
            "analytics",
            "marketing",
            "ip_prefix",
            "user_agent",
        ]
    )
    for r in rows:
        writer.writerow(
            _csv_safe(
                [
                    r.consent_id,
                    r.created_at,
                    r.banner_version,
                    r.preferences,
                    r.analytics,
                    r.marketing,
                    r.ip_prefix or "",
                    r.user_agent or "",
                ]
            )
        )
    return Response(
        status_code=200,
        content_type="text/csv; charset=utf-8",
        body=buf.getvalue(),
        headers={"Content-Disposition": f'attachment; filename="consents-{c.site_id}.csv"'},
    )


def _csv_safe(values: list[Any]) -> list[Any]:
    """Neutralize spreadsheet formula injection in exported text cells."""
    return [("'" + v) if isinstance(v, str) and v[:1] in "=+-@\t\r" else v for v in values]


# ----------------------------------------------------------------------------- forms


@router.get("/sites/<site_id>/forms")
def list_forms(site_id: str) -> list[forms.FormStored]:
    return forms.list_forms(ctx.site_context(router, site_id).site_id)


@router.post("/sites/<site_id>/forms")
def create_form(site_id: str, payload: Annotated[forms.FormConfig, Body()]) -> forms.FormStored:
    c = ctx.site_context(router, site_id)
    stored = forms.create_form(c.site_id, c.plan, payload)
    c.publish()
    return stored


@router.get("/sites/<site_id>/forms/<form_id>")
def get_form(site_id: str, form_id: str) -> forms.FormStored:
    return forms.get_form(ctx.site_context(router, site_id).site_id, form_id)


@router.put("/sites/<site_id>/forms/<form_id>")
def update_form(
    site_id: str, form_id: str, payload: Annotated[forms.FormConfig, Body()]
) -> forms.FormStored:
    c = ctx.site_context(router, site_id)
    stored = forms.update_form(c.site_id, form_id, payload)
    c.publish()
    return stored


@router.delete("/sites/<site_id>/forms/<form_id>")
def delete_form(site_id: str, form_id: str) -> Response[None]:
    c = ctx.site_context(router, site_id)
    forms.delete_form(c.site_id, form_id)
    c.publish()
    return Response(status_code=204, body=None)


@router.get("/sites/<site_id>/submissions")
def list_submissions(site_id: str, limit: Limit = 50, cursor: Cursor = None) -> SubmissionPage:
    c = ctx.site_context(router, site_id)
    items, nxt = forms.list_submissions(c.site_id, limit=limit, cursor=cursor)
    return SubmissionPage(items=items, next_cursor=nxt)


@router.patch("/sites/<site_id>/submissions/<submission_id>")
def patch_submission(
    site_id: str, submission_id: str, payload: Annotated[StatusIn, Body()]
) -> OkOut:
    c = ctx.site_context(router, site_id)
    forms.set_submission_status(c.site_id, submission_id, payload.status)
    return OkOut()


@router.delete("/sites/<site_id>/submissions/<submission_id>")
def delete_submission(site_id: str, submission_id: str) -> Response[None]:
    c = ctx.site_context(router, site_id)
    forms.delete_submission(c.site_id, submission_id)
    return Response(status_code=204, body=None)


# ----------------------------------------------------------------------------- newsletter


@router.get("/sites/<site_id>/newsletter")
def get_newsletter(site_id: str) -> newsletter.NewsletterConfig:
    return newsletter.get_config(ctx.site_context(router, site_id).site_id)


@router.put("/sites/<site_id>/newsletter")
def put_newsletter(
    site_id: str, payload: Annotated[newsletter.NewsletterConfig, Body()]
) -> newsletter.NewsletterConfig:
    c = ctx.site_context(router, site_id)
    saved = newsletter.save_config(c.site_id, payload)
    c.publish()
    return saved


@router.get("/sites/<site_id>/subscribers")
def list_subscribers(site_id: str, limit: Limit = 50, cursor: Cursor = None) -> SubscriberPage:
    c = ctx.site_context(router, site_id)
    items, nxt = newsletter.list_subscribers(c.site_id, limit=limit, cursor=cursor)
    return SubscriberPage(items=items, next_cursor=nxt)


# ----------------------------------------------------------------------------- surveys


@router.get("/sites/<site_id>/surveys")
def list_surveys(site_id: str) -> list[surveys.SurveyStored]:
    return surveys.list_surveys(ctx.site_context(router, site_id).site_id)


@router.post("/sites/<site_id>/surveys")
def create_survey(
    site_id: str, payload: Annotated[surveys.SurveyConfig, Body()]
) -> surveys.SurveyStored:
    c = ctx.site_context(router, site_id)
    stored = surveys.create_survey(c.site_id, c.plan, payload)
    c.publish()
    return stored


@router.put("/sites/<site_id>/surveys/<survey_id>")
def update_survey(
    site_id: str, survey_id: str, payload: Annotated[surveys.SurveyConfig, Body()]
) -> surveys.SurveyStored:
    c = ctx.site_context(router, site_id)
    stored = surveys.update_survey(c.site_id, survey_id, payload)
    c.publish()
    return stored


@router.delete("/sites/<site_id>/surveys/<survey_id>")
def delete_survey(site_id: str, survey_id: str) -> Response[None]:
    c = ctx.site_context(router, site_id)
    surveys.delete_survey(c.site_id, survey_id)
    c.publish()
    return Response(status_code=204, body=None)


@router.get("/sites/<site_id>/surveys/<survey_id>/results")
def survey_results(site_id: str, survey_id: str) -> dict[str, Any]:
    return surveys.results(ctx.site_context(router, site_id).site_id, survey_id)


# ----------------------------------------------------------------------------- catalog


@router.get("/sites/<site_id>/items")
def list_items(site_id: str) -> list[catalog.ItemStored]:
    return catalog.list_items(ctx.site_context(router, site_id).site_id)


@router.post("/sites/<site_id>/items")
def create_item(site_id: str, payload: Annotated[catalog.ItemConfig, Body()]) -> catalog.ItemStored:
    c = ctx.site_context(router, site_id)
    stored = catalog.create_item(c.site_id, c.plan, payload)
    c.publish()
    return stored


@router.put("/sites/<site_id>/items/<item_id>")
def update_item(
    site_id: str, item_id: str, payload: Annotated[catalog.ItemConfig, Body()]
) -> catalog.ItemStored:
    c = ctx.site_context(router, site_id)
    stored = catalog.update_item(c.site_id, item_id, payload)
    c.publish()
    return stored


@router.delete("/sites/<site_id>/items/<item_id>")
def delete_item(site_id: str, item_id: str) -> Response[None]:
    c = ctx.site_context(router, site_id)
    catalog.delete_item(c.site_id, item_id)
    c.publish()
    return Response(status_code=204, body=None)


@router.get("/sites/<site_id>/items/<item_id>/prices")
def list_prices(site_id: str, item_id: str) -> list[dict[str, Any]]:
    c = ctx.site_context(router, site_id)
    catalog.get_item(c.site_id, item_id)
    return catalog.list_price_overrides(c.site_id, item_id)


@router.put("/sites/<site_id>/items/<item_id>/prices")
def put_price(
    site_id: str, item_id: str, payload: Annotated[catalog.PriceOverride, Body()]
) -> OkOut:
    c = ctx.site_context(router, site_id)
    catalog.set_price_override(c.site_id, item_id, payload)
    return OkOut()


@router.delete("/sites/<site_id>/items/<item_id>/prices/<day>")
def delete_price(
    site_id: str, item_id: str, day: str, slot: Annotated[str | None, Query()] = None
) -> Response[None]:
    c = ctx.site_context(router, site_id)
    catalog.clear_price_override(c.site_id, item_id, day, slot)
    return Response(status_code=204, body=None)


@router.post("/sites/<site_id>/items/<item_id>/block")
def block_days(site_id: str, item_id: str, payload: Annotated[catalog.BlockIn, Body()]) -> OkOut:
    c = ctx.site_context(router, site_id)
    catalog.block_days(c.site_id, catalog.get_item(c.site_id, item_id), payload)
    return OkOut()


@router.get("/sites/<site_id>/bookings")
def list_bookings(site_id: str, limit: Limit = 50, cursor: Cursor = None) -> BookingPage:
    c = ctx.site_context(router, site_id)
    items, nxt = catalog.list_bookings(c.site_id, limit=limit, cursor=cursor)
    return BookingPage(items=items, next_cursor=nxt)


@router.patch("/sites/<site_id>/bookings/<booking_id>")
def patch_booking(
    site_id: str, booking_id: str, payload: Annotated[BookingStatusIn, Body()]
) -> catalog.BookingOut:
    c = ctx.site_context(router, site_id)
    return catalog.set_booking_status(c.site_id, booking_id, payload.status)
