"""Shared fixtures: a moto-backed AWS account and HTTP API v2 event helpers."""

from __future__ import annotations

import json
import os
from collections.abc import Callable, Iterator
from typing import Any

import boto3
import pytest
from moto import mock_aws

os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-north-1")
os.environ.setdefault("POWERTOOLS_LOG_LEVEL", "CRITICAL")

TABLE = "monethical-test"
BUCKET = "monethical-config-test"
TENANT_A = "11111111-aaaa-4aaa-8aaa-111111111111"
TENANT_B = "22222222-bbbb-4bbb-8bbb-222222222222"
STAFF = "99999999-ffff-4fff-8fff-999999999999"


def _reset_caches() -> None:
    from monethical.core import config, db, emailing, secrets, storage
    from monethical.domain import accounts

    config.get_settings.cache_clear()
    db.reset_client()
    storage.reset_client()
    emailing.reset_clients()
    secrets.reset()
    accounts.reset_client()


@pytest.fixture(autouse=True)
def aws(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("TABLE_NAME", TABLE)
    monkeypatch.setenv("CONFIG_BUCKET", BUCKET)
    monkeypatch.setenv("STAGE", "test")
    monkeypatch.setenv("DEV_PEPPER", "test-pepper")
    monkeypatch.setenv("SES_FROM", "noreply@example.com")
    monkeypatch.setenv("ORIGIN_VERIFY", "")
    with mock_aws():
        ddb = boto3.client("dynamodb")
        ddb.create_table(
            TableName=TABLE,
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "GSI1PK", "GSI1SK")
            ],
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "gsi1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )
        boto3.client("s3", region_name="eu-north-1").create_bucket(
            Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-north-1"}
        )
        sqs = boto3.client("sqs")
        queue_url = sqs.create_queue(QueueName="emails")["QueueUrl"]
        monkeypatch.setenv("EMAIL_QUEUE_URL", queue_url)
        _reset_caches()
        yield
        _reset_caches()


def make_event(
    method: str,
    path: str,
    *,
    body: Any = None,
    headers: dict[str, str] | None = None,
    query: dict[str, str] | None = None,
    claims: dict[str, Any] | None = None,
    ip: str = "203.0.113.7",
) -> dict[str, Any]:
    hdrs = {k.lower(): v for k, v in (headers or {}).items()}
    raw_body = None if body is None else (body if isinstance(body, str) else json.dumps(body))
    if raw_body is not None:
        hdrs.setdefault("content-type", "application/json")
    qs = "&".join(f"{k}={v}" for k, v in (query or {}).items())
    return {
        "version": "2.0",
        "routeKey": "ANY /{proxy+}",
        "rawPath": path,
        "rawQueryString": qs,
        "headers": hdrs,
        "queryStringParameters": query or None,
        "requestContext": {
            "accountId": "123456789012",
            "apiId": "api",
            "domainName": "example.test",
            "domainPrefix": "example",
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": ip,
                "userAgent": "pytest",
            },
            "requestId": "req",
            "routeKey": "ANY /{proxy+}",
            "stage": "$default",
            "time": "01/Jan/2026:00:00:00 +0000",
            "timeEpoch": 0,
            **({"authorizer": {"jwt": {"claims": claims, "scopes": []}}} if claims else {}),
        },
        "body": raw_body,
        "isBase64Encoded": False,
    }


class Api:
    """Tiny in-process client for a Lambda handler."""

    def __init__(
        self,
        handler: Callable[[dict[str, Any], Any], dict[str, Any]],
        claims: dict[str, Any] | None = None,
    ):
        self.handler = handler
        self.claims = claims

    def call(self, method: str, path: str, **kw: Any) -> tuple[int, Any, dict[str, Any]]:
        kw.setdefault("claims", self.claims)
        res = self.handler(
            make_event(method, path, **kw),
            type(
                "Ctx",
                (),
                {
                    "function_name": "t",
                    "memory_limit_in_mb": 128,
                    "invoked_function_arn": "arn",
                    "aws_request_id": "r",
                },
            )(),
        )
        raw = res.get("body") or ""
        try:
            data = json.loads(raw) if raw else None
        except ValueError:
            data = raw
        return res["statusCode"], data, res.get("headers", {})

    def get(self, path: str, **kw: Any) -> tuple[int, Any, dict[str, Any]]:
        return self.call("GET", path, **kw)

    def post(self, path: str, body: Any = None, **kw: Any) -> tuple[int, Any, dict[str, Any]]:
        return self.call("POST", path, body=body if body is not None else {}, **kw)

    def put(self, path: str, body: Any = None, **kw: Any) -> tuple[int, Any, dict[str, Any]]:
        return self.call("PUT", path, body=body if body is not None else {}, **kw)

    def patch(self, path: str, body: Any = None, **kw: Any) -> tuple[int, Any, dict[str, Any]]:
        return self.call("PATCH", path, body=body if body is not None else {}, **kw)

    def delete(self, path: str, **kw: Any) -> tuple[int, Any, dict[str, Any]]:
        return self.call("DELETE", path, **kw)


def claims_for(sub: str, email: str, groups: list[str] | None = None) -> dict[str, Any]:
    c: dict[str, Any] = {"sub": sub, "email": email}
    if groups:
        c["cognito:groups"] = "[" + " ".join(groups) + "]"
    return c


@pytest.fixture
def console_a() -> Api:
    from monethical.handlers import console

    return Api(console.handler, claims_for(TENANT_A, "a@example.com"))


@pytest.fixture
def console_b() -> Api:
    from monethical.handlers import console

    return Api(console.handler, claims_for(TENANT_B, "b@example.com"))


@pytest.fixture
def console_staff() -> Api:
    from monethical.handlers import console

    return Api(console.handler, claims_for(STAFF, "staff@monethical.test", ["staff"]))


@pytest.fixture
def public() -> Api:
    from monethical.handlers import public as public_handler

    return Api(public_handler.handler)


@pytest.fixture
def site_a(console_a: Api) -> dict[str, Any]:
    status, data, _ = console_a.post(
        "/v1/sites", {"name": "Agriturismo Rossi", "domains": ["rossi.example.com"]}
    )
    assert status == 200, data
    return data  # type: ignore[no-any-return]


def drain_queue() -> list[dict[str, Any]]:
    sqs = boto3.client("sqs")
    url = os.environ["EMAIL_QUEUE_URL"]
    out: list[dict[str, Any]] = []
    while True:
        res = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10)
        msgs = res.get("Messages", [])
        if not msgs:
            return out
        for m in msgs:
            out.append(json.loads(m["Body"]))
            sqs.delete_message(QueueUrl=url, ReceiptHandle=m["ReceiptHandle"])
