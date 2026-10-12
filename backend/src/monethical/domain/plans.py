"""Plans and their limits. Accounts are created by Monethical staff, who assign the plan."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PlanId = Literal["FREE", "PRO", "EMPIRE"]


@dataclass(frozen=True, slots=True)
class PlanLimits:
    display_name: str
    max_sites: int
    max_forms_per_site: int
    max_items_per_site: int
    max_surveys_per_site: int


PLANS: dict[str, PlanLimits] = {
    "FREE": PlanLimits("Starter", 1, 1, 5, 2),
    "PRO": PlanLimits("Business", 5, 5, 50, 10),
    "EMPIRE": PlanLimits("Empire", 50, 25, 500, 50),
}

DEFAULT_PLAN: PlanId = "FREE"


def limits(plan: str) -> PlanLimits:
    return PLANS.get(plan, PLANS[DEFAULT_PLAN])
