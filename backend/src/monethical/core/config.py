"""Runtime configuration, read once from the Lambda environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True, slots=True)
class Settings:
    stage: str
    table_name: str
    config_bucket: str
    cdn_base_url: str
    email_queue_url: str
    ses_from: str
    ses_region: str
    console_origins: tuple[str, ...]
    stripe_secret_arn: str
    pepper_secret_arn: str
    user_pool_id: str
    log_level: str

    @property
    def is_production(self) -> bool:
        return self.stage == "prod"


def _csv(value: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in value.split(",") if part.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        stage=os.environ.get("STAGE", "dev"),
        table_name=os.environ.get("TABLE_NAME", "monethical-core"),
        config_bucket=os.environ.get("CONFIG_BUCKET", ""),
        cdn_base_url=os.environ.get("CDN_BASE_URL", "").rstrip("/"),
        email_queue_url=os.environ.get("EMAIL_QUEUE_URL", ""),
        ses_from=os.environ.get("SES_FROM", ""),
        ses_region=os.environ.get("SES_REGION", os.environ.get("AWS_REGION", "eu-north-1")),
        console_origins=_csv(os.environ.get("CONSOLE_ORIGINS", "")),
        stripe_secret_arn=os.environ.get("STRIPE_SECRET_ARN", ""),
        pepper_secret_arn=os.environ.get("PEPPER_SECRET_ARN", ""),
        user_pool_id=os.environ.get("USER_POOL_ID", ""),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
    )
