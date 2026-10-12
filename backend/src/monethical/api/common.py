"""Shared API plumbing: resolver factory, error mapping, response helpers."""

from __future__ import annotations

import json
from typing import Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, Response, content_types
from aws_lambda_powertools.event_handler.openapi.exceptions import RequestValidationError

from monethical.core.errors import ApiError

logger = Logger(service="monethical")

CREATED = 201


def json_response(
    status: int, payload: Any, headers: dict[str, str | list[str]] | None = None
) -> Response[str]:
    body = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, separators=(",", ":"), default=str)
    )
    return Response(
        status_code=status, content_type=content_types.APPLICATION_JSON, body=body, headers=headers
    )


def error_response(status: int, code: str, message: str, details: Any = None) -> Response[str]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return json_response(status, {"error": error})


def build_app(*, title: str) -> APIGatewayHttpResolver:
    app = APIGatewayHttpResolver(enable_validation=True)
    app.configure_openapi(title=title, version="2.0.0")  # spec is generated at build time only

    @app.exception_handler(ApiError)
    def _api_error(exc: ApiError) -> Response[str]:
        if exc.status >= 500:
            logger.exception("api error")
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    def _validation(exc: RequestValidationError) -> Response[str]:
        details = [
            {
                "field": ".".join(str(p) for p in e.get("loc", ())[1:]),
                "message": e.get("msg", "invalid"),
            }
            for e in exc.errors()
        ][:20]
        return error_response(400, "validation_error", "Invalid request", details)

    @app.exception_handler(Exception)
    def _unexpected(exc: Exception) -> Response[str]:
        logger.exception("unhandled error")
        return error_response(500, "internal_error", "Internal error")

    @app.not_found
    def _not_found(_: Exception) -> Response[str]:
        return error_response(404, "not_found", "Route not found")

    return app
