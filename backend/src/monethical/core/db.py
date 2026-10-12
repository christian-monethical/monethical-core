"""Thin, typed DynamoDB access layer (single table).

All key conventions live in :mod:`monethical.core.keys`. Items cross this boundary as
plain Python dicts (ints/floats/str/bool/list/dict); Decimal handling stays internal.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from functools import lru_cache
from typing import Any

import boto3
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.config import Config
from botocore.exceptions import ClientError

from monethical.core.config import get_settings
from monethical.core.errors import BadRequest, Conflict

Item = dict[str, Any]

_ser = TypeSerializer()
_de = TypeDeserializer()

MAX_PAGE = 100


@dataclass(slots=True)
class Page:
    items: list[Item]
    next_cursor: str | None = None


@dataclass(slots=True)
class Op:
    """One operation of a transaction."""

    kind: str  # put | delete | update | check
    key: dict[str, str] = field(default_factory=dict)
    item: Item | None = None
    update: str | None = None
    condition: str | None = None
    names: dict[str, str] | None = None
    values: Item | None = None


def _clean(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    if isinstance(value, set):
        return sorted(_clean(v) for v in value)
    return value


def _to_db(value: Any) -> Any:
    """Floats are not allowed by the serializer; empty strings/None are dropped."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_db(v) for k, v in value.items() if v is not None and v != ""}
    if isinstance(value, (list, tuple)):
        return [_to_db(v) for v in value]
    return value


def _ser_map(values: Item | None) -> dict[str, Any]:
    return {k: _ser.serialize(_to_db(v)) for k, v in (values or {}).items()}


def _ser_item(item: Item) -> dict[str, Any]:
    """Serialize a stored item: absent values are omitted rather than stored as NULL/empty."""
    return _ser_map({k: v for k, v in item.items() if v is not None and v != ""})


def _from_db(raw: dict[str, Any]) -> Item:
    cleaned: Item = _clean({k: _de.deserialize(v) for k, v in raw.items()})
    return cleaned


def encode_cursor(key: dict[str, Any] | None) -> str | None:
    if not key:
        return None
    plain = {k: _de.deserialize(v) for k, v in key.items()}
    return base64.urlsafe_b64encode(json.dumps(plain, separators=(",", ":")).encode()).decode()


def decode_cursor(
    cursor: str | None, *, pk: str, index: str | None = None
) -> dict[str, Any] | None:
    """Decode a client cursor; it must belong to the partition being queried."""
    if not cursor:
        return None
    try:
        plain = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        pk_attr = "GSI1PK" if index == "gsi1" else "PK"
        if not isinstance(plain, dict) or plain.get(pk_attr) != pk:
            raise ValueError("cursor partition mismatch")
        return {k: _ser.serialize(str(v)) for k, v in plain.items()}
    except (ValueError, TypeError) as exc:
        raise BadRequest("Invalid cursor", code="invalid_cursor") from exc


@lru_cache(maxsize=1)
def _client() -> Any:
    return boto3.client(
        "dynamodb",
        config=Config(retries={"max_attempts": 4, "mode": "standard"}, tcp_keepalive=True),
    )


def reset_client() -> None:
    """Drop the cached client (tests re-create it under a mocked AWS)."""
    _client.cache_clear()


def _table() -> str:
    return get_settings().table_name


def get(pk: str, sk: str, *, consistent: bool = False) -> Item | None:
    res = _client().get_item(
        TableName=_table(), Key=_ser_map({"PK": pk, "SK": sk}), ConsistentRead=consistent
    )
    raw = res.get("Item")
    return _from_db(raw) if raw else None


def put(item: Item, *, must_not_exist: bool = False) -> None:
    kwargs: dict[str, Any] = {"TableName": _table(), "Item": _ser_item(item)}
    if must_not_exist:
        kwargs["ConditionExpression"] = "attribute_not_exists(PK)"
    try:
        _client().put_item(**kwargs)
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise Conflict("Item already exists") from exc
        raise


def delete(pk: str, sk: str) -> None:
    _client().delete_item(TableName=_table(), Key=_ser_map({"PK": pk, "SK": sk}))


def update(
    pk: str,
    sk: str,
    *,
    set_values: Item | None = None,
    add_values: dict[str, int] | None = None,
    remove: Iterable[str] = (),
    condition: str | None = None,
    cond_values: Item | None = None,
    return_new: bool = False,
) -> Item | None:
    """UpdateItem with SET/ADD/REMOVE built from plain dicts."""
    names: dict[str, str] = {}
    values: Item = dict(cond_values or {})
    sets: list[str] = []
    adds: list[str] = []
    removes: list[str] = []
    for i, (attr, val) in enumerate((set_values or {}).items()):
        names[f"#s{i}"] = attr
        values[f":s{i}"] = val
        sets.append(f"#s{i} = :s{i}")
    for i, (attr, val) in enumerate((add_values or {}).items()):
        names[f"#a{i}"] = attr
        values[f":a{i}"] = val
        adds.append(f"#a{i} :a{i}")
    for i, attr in enumerate(remove):
        names[f"#r{i}"] = attr
        removes.append(f"#r{i}")
    expr = ""
    if sets:
        expr += "SET " + ", ".join(sets) + " "
    if adds:
        expr += "ADD " + ", ".join(adds) + " "
    if removes:
        expr += "REMOVE " + ", ".join(removes)
    kwargs: dict[str, Any] = {
        "TableName": _table(),
        "Key": _ser_map({"PK": pk, "SK": sk}),
        "UpdateExpression": expr.strip(),
        "ExpressionAttributeNames": names,
    }
    if values:
        kwargs["ExpressionAttributeValues"] = _ser_map(values)
    if condition:
        kwargs["ConditionExpression"] = condition
    if return_new:
        kwargs["ReturnValues"] = "ALL_NEW"
    try:
        res = _client().update_item(**kwargs)
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise Conflict("Condition not met") from exc
        raise
    return _from_db(res["Attributes"]) if return_new and "Attributes" in res else None


def query(
    pk: str,
    *,
    sk_prefix: str | None = None,
    sk_between: tuple[str, str] | None = None,
    index: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    forward: bool = True,
) -> Page:
    """Query one partition. ``index='gsi1'`` uses GSI1PK/GSI1SK."""
    pk_attr, sk_attr = ("GSI1PK", "GSI1SK") if index == "gsi1" else ("PK", "SK")
    names = {"#pk": pk_attr}
    values: Item = {":pk": pk}
    cond = "#pk = :pk"
    if sk_prefix:
        names["#sk"] = sk_attr
        values[":sk"] = sk_prefix
        cond += " AND begins_with(#sk, :sk)"
    elif sk_between:
        names["#sk"] = sk_attr
        values[":lo"], values[":hi"] = sk_between
        cond += " AND #sk BETWEEN :lo AND :hi"
    kwargs: dict[str, Any] = {
        "TableName": _table(),
        "KeyConditionExpression": cond,
        "ExpressionAttributeNames": names,
        "ExpressionAttributeValues": _ser_map(values),
        "Limit": max(1, min(limit, MAX_PAGE)),
        "ScanIndexForward": forward,
    }
    if index == "gsi1":
        kwargs["IndexName"] = "gsi1"
    start = decode_cursor(cursor, pk=pk, index=index)
    if start:
        kwargs["ExclusiveStartKey"] = start
    res = _client().query(**kwargs)
    return Page(
        [_from_db(i) for i in res.get("Items", [])], encode_cursor(res.get("LastEvaluatedKey"))
    )


def query_all(
    pk: str, *, sk_prefix: str | None = None, index: str | None = None, cap: int = 2000
) -> list[Item]:
    """Collect a whole (bounded) partition slice. Use only for small, bounded sets."""
    out: list[Item] = []
    cursor: str | None = None
    while True:
        page = query(pk, sk_prefix=sk_prefix, index=index, limit=MAX_PAGE, cursor=cursor)
        out.extend(page.items)
        cursor = page.next_cursor
        if not cursor or len(out) >= cap:
            return out[:cap]


def transact(ops: list[Op]) -> None:
    """Atomic multi-item write (max 100 operations)."""
    table = _table()
    entries: list[dict[str, Any]] = []
    for op in ops:
        if op.kind == "put":
            e: dict[str, Any] = {"TableName": table, "Item": _ser_item(op.item or {})}
            body = {"Put": e}
        elif op.kind == "delete":
            e = {"TableName": table, "Key": _ser_map(op.key)}
            body = {"Delete": e}
        elif op.kind == "check":
            e = {"TableName": table, "Key": _ser_map(op.key)}
            body = {"ConditionCheck": e}
        else:
            e = {"TableName": table, "Key": _ser_map(op.key), "UpdateExpression": op.update}
            body = {"Update": e}
        if op.condition:
            e["ConditionExpression"] = op.condition
        if op.names:
            e["ExpressionAttributeNames"] = op.names
        if op.values:
            e["ExpressionAttributeValues"] = _ser_map(op.values)
        entries.append(body)
    try:
        _client().transact_write_items(TransactItems=entries)
    except ClientError as exc:
        if exc.response["Error"]["Code"] in {
            "TransactionCanceledException",
            "ConditionalCheckFailedException",
        }:
            raise Conflict("Conflicting write") from exc
        raise


def delete_partition(pk: str) -> int:
    """Delete every item of a partition in batches. Returns the number of deleted items."""
    count = 0
    cursor: str | None = None
    while True:
        page = query(pk, limit=MAX_PAGE, cursor=cursor)
        for chunk_start in range(0, len(page.items), 25):
            chunk = page.items[chunk_start : chunk_start + 25]
            pending: dict[str, Any] = {
                _table(): [
                    {"DeleteRequest": {"Key": _ser_map({"PK": i["PK"], "SK": i["SK"]})}}
                    for i in chunk
                ]
            }
            for _ in range(5):
                pending = (
                    _client().batch_write_item(RequestItems=pending).get("UnprocessedItems") or {}
                )
                if not pending:
                    break
            count += len(chunk)
        cursor = page.next_cursor
        if not cursor:
            return count
