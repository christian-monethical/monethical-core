"""Time-sortable identifiers and key generation."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import UTC, datetime

_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"  # Crockford base32, lowercase


def _encode(value: int, length: int) -> str:
    chars = []
    for _ in range(length):
        chars.append(_ALPHABET[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def new_id() -> str:
    """26-char id: 10 chars of millisecond time + 16 chars of randomness (sortable)."""
    millis = int(time.time() * 1000)
    return _encode(millis, 10) + _encode(secrets.randbits(80), 16)


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_site_key() -> str:
    """Public, non-secret identifier embedded in customer pages."""
    return f"pk_live_{secrets.token_hex(16)}"


def new_secret_key() -> tuple[str, str, str]:
    """Return (plaintext, sha256 hash, display prefix). The plaintext is shown once."""
    plaintext = f"sk_live_{secrets.token_urlsafe(36)}"
    return plaintext, hash_secret(plaintext), plaintext[:12]


def hash_secret(secret: str) -> str:
    # Secrets carry 288 bits of entropy, so an unsalted SHA-256 is sufficient.
    return hashlib.sha256(secret.encode()).hexdigest()


def hash_ip(ip: str, site_id: str, pepper: str) -> str:
    """Keyed hash of a visitor IP: not reversible by brute force without the pepper."""
    return hmac.new(pepper.encode(), f"{site_id}|{ip}".encode(), hashlib.sha256).hexdigest()[:32]


def mask_ip(ip: str) -> str:
    """Truncate an IP (IPv4 /24, IPv6 /48) for display and storage."""
    import ipaddress

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ""
    prefix = 24 if addr.version == 4 else 48
    return str(ipaddress.ip_network(f"{addr}/{prefix}", strict=False).network_address)
