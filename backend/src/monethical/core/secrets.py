"""Secrets Manager access with per-container caching (values never touch Lambda env vars)."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

import boto3

from monethical.core.config import get_settings


@lru_cache(maxsize=1)
def _client() -> Any:
    return boto3.client("secretsmanager")


@lru_cache(maxsize=8)
def _load(arn: str) -> dict[str, str]:
    raw = _client().get_secret_value(SecretId=arn)["SecretString"]
    value = json.loads(raw)
    return (
        {str(k): str(v) for k, v in value.items()}
        if isinstance(value, dict)
        else {"value": str(value)}
    )


def reset() -> None:
    _client.cache_clear()
    _load.cache_clear()


def ip_pepper() -> str:
    """Pepper for visitor-IP hashing. A fixed fallback is used only outside production."""
    settings = get_settings()
    if settings.pepper_secret_arn:
        return _load(settings.pepper_secret_arn).get("pepper", "")
    if settings.is_production:
        raise RuntimeError("PEPPER_SECRET_ARN is required in production")
    return os.environ.get("DEV_PEPPER", "dev-only-pepper")


def stripe_keys() -> tuple[str, str]:
    """Return (secret_key, webhook_secret)."""
    arn = get_settings().stripe_secret_arn
    if not arn:
        return "", ""
    data = _load(arn)
    return data.get("secret_key", ""), data.get("webhook_secret", "")
