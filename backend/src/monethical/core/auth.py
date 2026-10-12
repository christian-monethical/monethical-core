"""Console authentication context.

API Gateway's JWT authorizer validates the Cognito token (signature, expiry, audience)
before the Lambda runs. This module only reads the verified claims.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from monethical.core.errors import Forbidden, Unauthorized

STAFF_GROUP = "staff"


@dataclass(frozen=True, slots=True)
class Principal:
    tenant_id: str  # Cognito ``sub``: one account == one Cognito user
    email: str
    groups: frozenset[str]

    @property
    def is_staff(self) -> bool:
        return STAFF_GROUP in self.groups


def _groups(raw: Any) -> frozenset[str]:
    if isinstance(raw, list):
        return frozenset(str(g) for g in raw)
    if isinstance(raw, str):
        cleaned = raw.strip("[]").replace('"', "")
        return frozenset(g.strip() for g in cleaned.replace(",", " ").split() if g.strip())
    return frozenset()


def principal_from_claims(claims: dict[str, Any] | None) -> Principal:
    if not claims or not claims.get("sub"):
        raise Unauthorized("Authentication required")
    return Principal(
        tenant_id=str(claims["sub"]),
        email=str(claims.get("email", "")),
        groups=_groups(claims.get("cognito:groups")),
    )


def require_staff(principal: Principal) -> None:
    if not principal.is_staff:
        raise Forbidden("Staff only")
