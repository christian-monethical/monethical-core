"""Publishing of immutable-ish config snapshots to S3 (served through CloudFront)."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import boto3

from monethical.core.config import get_settings

CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=600"


@lru_cache(maxsize=1)
def _s3() -> Any:
    return boto3.client("s3")


def reset_client() -> None:
    _s3.cache_clear()


def snapshot_key(site_key: str, name: str) -> str:
    return f"config/{site_key}/{name}.json"


def publish_json(site_key: str, name: str, payload: dict[str, Any]) -> None:
    bucket = get_settings().config_bucket
    if not bucket:  # local/dev without storage: public API serves from the database
        return
    _s3().put_object(
        Bucket=bucket,
        Key=snapshot_key(site_key, name),
        Body=json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode(),
        ContentType="application/json; charset=utf-8",
        CacheControl=CACHE_CONTROL,
    )


def delete_site_snapshots(site_key: str) -> None:
    bucket = get_settings().config_bucket
    if not bucket:
        return
    prefix = f"config/{site_key}/"
    res = _s3().list_objects_v2(Bucket=bucket, Prefix=prefix)
    objects = [{"Key": o["Key"]} for o in res.get("Contents", [])]
    if objects:
        _s3().delete_objects(Bucket=bucket, Delete={"Objects": objects})
