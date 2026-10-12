"""Import legacy Agriconsent / FormRelay data into the new platform.

Inputs are JSON files, so the script never needs credentials for the old systems:

* ``--site-data``/``--banners``/``--consents``: the old API's ``GET /dump/<collection>?fmt=json`` output
  (or a Firestore export) of the collections ``site_data``, ``banners``, ``consents``.
* ``--formrelay-map``: JSON ``{"host": "info@x.it" | ["a@x.it", "b@x.it"]}`` (the ``SITE_TO_EMAIL_MAP``
  Lambda variable of FormRelay).
* ``--tenants``: JSON ``{"<site host>": "<tenant_id (Cognito sub)>"}``; hosts missing from it use ``--tenant-id``.

Run against the TEST environment first. Use ``--dry-run`` to print the plan without writing.

    python scripts/migrate_legacy.py --table monethical-core-test --tenant-id <sub> \
        --site-data site_data.json --banners banners.json --consents consents.json \
        --formrelay-map map.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


def load(path: str | None) -> Any:
    if not path:
        return None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["items"] if isinstance(data, dict) and "items" in data else data


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--table", required=True)
    parser.add_argument(
        "--tenant-id", required=True, help="default owner (Cognito sub) for migrated sites"
    )
    parser.add_argument("--tenants", help="JSON host -> tenant_id overrides")
    parser.add_argument("--site-data")
    parser.add_argument("--banners")
    parser.add_argument("--consents")
    parser.add_argument("--formrelay-map")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    os.environ["TABLE_NAME"] = args.table
    os.environ.setdefault("STAGE", "test")
    os.environ.setdefault("DEV_PEPPER", "migration")

    from monethical.core import db, keys
    from monethical.core.auth import Principal
    from monethical.core.errors import Conflict
    from monethical.domain import banner, forms, legacy, sites

    site_rows: list[dict[str, Any]] = load(args.site_data) or []
    banner_rows: list[dict[str, Any]] = load(args.banners) or []
    consent_rows: list[dict[str, Any]] = load(args.consents) or []
    relay_map: dict[str, Any] = load(args.formrelay_map) or {}
    tenants: dict[str, str] = load(args.tenants) or {}

    banners_by_site = {str(b.get("site_ref", "")).split("/")[-1]: b for b in banner_rows}
    summary = {"sites": 0, "banners": 0, "consents": 0, "forms": 0, "warnings": 0}
    site_by_banner: dict[str, tuple[str, int]] = {}

    # hosts known only to FormRelay (no site_data row) become sites too
    pending: dict[str, dict[str, Any]] = {
        legacy.host_from_site_url(r["site_url"]): r for r in site_rows if r.get("site_url")
    }
    for host in relay_map:
        pending.setdefault(legacy.host_from_site_url(host).removeprefix("www."), {"site_url": host})

    for host, row in sorted(pending.items()):
        if not host:
            continue
        bare = host.removeprefix("www.")
        tenant_id = tenants.get(bare) or tenants.get(f"www.{bare}") or args.tenant_id
        domains = legacy.domains_for(bare)
        name = str(row.get("ragione_sociale") or bare)[:120]
        print(f"site {bare} -> tenant {tenant_id[:8]}… domains={domains}")
        summary["sites"] += 1
        site: dict[str, Any] | None = None
        if not args.dry_run:
            principal = Principal(
                tenant_id=tenant_id, email=str(row.get("email", "")), groups=frozenset()
            )
            profile = sites.ensure_account(principal)
            if (
                profile.get("plan") != "EMPIRE"
            ):  # migration must not trip plan limits; staff re-assign afterwards
                db.update(keys.account(tenant_id), keys.PROFILE, set_values={"plan": "EMPIRE"})
            try:
                site = sites.create_site(principal, sites.SiteCreate(name=name, domains=domains))
            except Conflict:
                lookup = sites.lookup_by_host(bare)
                if lookup is None:
                    raise
                site = db.get(
                    keys.account(lookup["tenant_id"]), f"{keys.SK_SITE}{lookup['site_id']}"
                )
                print("  site already exists, reusing it")

        old_banner = next(
            (banners_by_site[k] for k in (str(row.get("id", "")),) if k in banners_by_site), None
        )
        if old_banner:
            config, warns = legacy.map_banner(old_banner)
            for w in warns:
                print(f"  warning: {w}")
            summary["warnings"] += len(warns)
            summary["banners"] += 1
            if site is not None:
                stored = banner.save_config(site["site_id"], config)
                site_by_banner[str(old_banner.get("id"))] = (site["site_id"], stored.version)

        recipients = legacy.recipients_of(
            relay_map.get(host) or relay_map.get(bare) or relay_map.get(f"www.{bare}")
        )
        if recipients:
            summary["forms"] += 1
            print(f"  form recipients: {recipients}")
            if site is not None and not forms.list_forms(site["site_id"]):
                forms.create_form(site["site_id"], "EMPIRE", legacy.legacy_contact_form(recipients))

    for row in consent_rows:
        ref = str(row.get("banner_id") or "").split("/")[-1]
        target = site_by_banner.get(ref)
        if target is None and not args.dry_run:
            continue
        summary["consents"] += 1
        if not args.dry_run and target is not None:
            db.put(legacy.map_consent(row, target[0], target[1]))

    if not args.dry_run:
        from monethical.domain import snapshots

        for tenant_id in {tenants.get(h, args.tenant_id) for h in pending} | {args.tenant_id}:
            for s in sites.list_sites(tenant_id):
                snapshots.publish(s)

    print("\nsummary:", json.dumps(summary), "(dry run)" if args.dry_run else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
