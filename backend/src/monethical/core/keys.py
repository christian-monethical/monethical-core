"""Single-table key conventions (schema v3).

Partitions
  ACCOUNT#<tenant>   profile, sites, secret-key records of one customer account
  SITE#<site>        every entity that belongs to one site (config, forms, items, logs...)
  SITEKEY#<pk_live>  public lookup: site key -> site (one GetItem per public request)
  DOMAIN#<host>      uniqueness + lookup: host -> site
  SECRET#<sha256>    lookup for server-to-server secret keys
  RL#<bucket>        rate-limit counters (TTL)

Ownership is always resolved through ACCOUNT#<tenant>/SITE#<site>, never from client input.
"""

from __future__ import annotations


def account(tenant_id: str) -> str:
    return f"ACCOUNT#{tenant_id}"


def site(site_id: str) -> str:
    return f"SITE#{site_id}"


def site_key(key: str) -> str:
    return f"SITEKEY#{key}"


def domain(host: str) -> str:
    return f"DOMAIN#{host}"


def secret(hashed: str) -> str:
    return f"SECRET#{hashed}"


PROFILE = "PROFILE"
LOOKUP = "LOOKUP"

# Sort-key prefixes inside ACCOUNT#
SK_SITE = "SITE#"
SK_SECRET = "KEY#"  # noqa: S105 - sort-key prefix, not a credential

# Sort-key prefixes inside SITE#
SK_BANNER = "BANNER"
SK_FORM = "FORM#"
SK_SUBMISSION = "SUB#"
SK_CONSENT = "CONSENT#"
SK_ITEM = "ITEM#"
SK_SLUG = "SLUG#"
SK_BOOKING = "BOOKING#"
SK_BLOCK = "BLOCK#"
SK_PRICE = "PRICE#"
SK_NEWSLETTER_CFG = "NEWSLETTER"
SK_SUBSCRIBER = "NLSUB#"
SK_SURVEY = "SURVEY#"
SK_RESPONSE = "RESP#"
SK_STAT = "STAT#"
SK_CATALOG = "CATALOG"
