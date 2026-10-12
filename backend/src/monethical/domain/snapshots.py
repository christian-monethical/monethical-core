"""Build and publish the public, cacheable per-site configuration documents.

Widgets read these from the CDN, so a page view never reaches Lambda or DynamoDB.
Documents are rebuilt whenever a console write changes anything they contain.
"""

from __future__ import annotations

from typing import Any

from monethical.core import storage
from monethical.core.ids import now_iso
from monethical.domain import banner, forms

SCHEMA_VERSION = 1


def build_site_document(site: dict[str, Any]) -> dict[str, Any]:
    """The loader document: which modules are active plus their (small) configuration."""
    site_id = site["site_id"]
    cfg = banner.get_config(site_id)
    doc: dict[str, Any] = {
        "v": SCHEMA_VERSION,
        "site_key": site["site_key"],
        "generated_at": now_iso(),
        "banner": cfg.model_dump() if cfg.version > 0 and cfg.enabled else None,
        "forms": [forms.public_view(f) for f in forms.list_forms(site_id) if f.enabled],
    }
    for extra in _extra_sections(site_id):
        doc.update(extra)
    return doc


def _extra_sections(site_id: str) -> list[dict[str, Any]]:
    """Sections contributed by optional modules (newsletter, surveys, catalog)."""
    sections: list[dict[str, Any]] = []
    from monethical.domain import catalog, newsletter, surveys

    sections.append({"newsletter": newsletter.public_view(site_id)})
    sections.append({"surveys": surveys.public_list(site_id)})
    sections.append({"catalog": catalog.public_catalog(site_id)})
    return sections


def publish(site: dict[str, Any]) -> dict[str, Any]:
    """Rebuild and upload the site document. Paused sites are unpublished."""
    if site.get("status") != "active":
        storage.delete_site_snapshots(site["site_key"])
        return {}
    doc = build_site_document(site)
    storage.publish_json(site["site_key"], "site", doc)
    return doc
