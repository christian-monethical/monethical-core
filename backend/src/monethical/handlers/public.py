"""Lambda entrypoint: public visitor API, legacy adapters and the Stripe webhook."""

from __future__ import annotations

import base64
from typing import Any

from aws_lambda_powertools.event_handler import Response
from aws_lambda_powertools.utilities.typing import LambdaContext

from monethical.api import legacy_routes, public_guard, public_routes
from monethical.api.common import build_app, error_response, json_response, logger
from monethical.core.errors import ApiError
from monethical.domain import payments

app = build_app(title="Monethical Public API")
app.use(middlewares=[public_guard.guard])
app.include_router(public_routes.router)
app.include_router(legacy_routes.router)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/webhooks/stripe")
def stripe_webhook() -> Response[Any]:
    event = app.current_event
    signature = event.headers.get("stripe-signature", "")
    raw = (
        base64.b64decode(event.body or "")
        if event.is_base64_encoded
        else (event.body or "").encode()
    )
    try:
        outcome = payments.handle_webhook(raw, signature)
    except ApiError as exc:
        return error_response(exc.status, exc.code, exc.message)
    return json_response(200, {"received": outcome})


@logger.inject_lambda_context
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    too_big = public_guard.oversized(event)
    if too_big is not None:
        return too_big
    preflight = public_guard.handle_preflight(event)
    if preflight is not None:
        return preflight
    return app.resolve(event, context)
