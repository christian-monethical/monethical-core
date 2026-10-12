"""Closed design-token vocabulary shared by every customer-facing widget.

Customers never supply raw CSS or HTML: only validated tokens. Widgets turn tokens into CSS
custom properties inside a Shadow DOM, so a configuration can never inject code into a site.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")


def _color(value: str) -> str:
    if not _COLOR_RE.match(value):
        raise ValueError("must be a #RRGGBB or #RRGGBBAA hex color")
    return value.lower()


def _https(value: str) -> str:
    if not value.startswith("https://") or len(value) > 500 or any(c in value for c in " \"'<>\\"):
        raise ValueError("must be a valid https:// URL")
    return value


Color = Annotated[str, AfterValidator(_color)]
HttpsUrl = Annotated[str, AfterValidator(_https)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
MediumText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]

FontFamily = Literal["system", "serif", "rounded", "mono"]
Elevation = Literal["none", "low", "medium", "high"]
Density = Literal["compact", "comfortable", "spacious"]


class Surface(BaseModel):
    """Common look of a card-like widget surface."""

    model_config = ConfigDict(extra="forbid")

    background: Color = "#ffffff"
    text: Color = "#1d1d1f"
    muted: Color = "#6e6e73"
    accent: Color = "#0f172a"
    accent_text: Color = "#ffffff"
    border: Color = "#e5e5ea"
    radius: int = Field(default=14, ge=0, le=32)
    elevation: Elevation = "medium"
    density: Density = "comfortable"
    font: FontFamily = "system"
