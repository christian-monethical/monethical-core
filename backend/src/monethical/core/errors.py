"""Typed API errors. Messages are safe to show to clients; internals never leak."""

from __future__ import annotations


class ApiError(Exception):
    status: int = 500
    code: str = "internal_error"

    def __init__(self, message: str | None = None, *, code: str | None = None) -> None:
        super().__init__(message or self.code)
        self.message = message or self.code
        if code:
            self.code = code


class BadRequest(ApiError):
    status = 400
    code = "bad_request"


class Unauthorized(ApiError):
    status = 401
    code = "unauthorized"


class Forbidden(ApiError):
    status = 403
    code = "forbidden"


class NotFound(ApiError):
    status = 404
    code = "not_found"


class Conflict(ApiError):
    status = 409
    code = "conflict"


class PaymentRequired(ApiError):
    status = 402
    code = "payment_required"


class PayloadTooLarge(ApiError):
    status = 413
    code = "payload_too_large"


class TooManyRequests(ApiError):
    status = 429
    code = "rate_limited"
