"""Surveys: question definitions, visitor responses and aggregated results."""

from __future__ import annotations

from collections import Counter
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from monethical.core import db, keys
from monethical.core.errors import BadRequest, Forbidden, NotFound
from monethical.core.ids import new_id, now_iso
from monethical.domain import plans
from monethical.domain.forms import FieldKey
from monethical.domain.styles import MediumText, ShortText, Surface

QuestionType = Literal["text", "rating", "choice", "boolean"]
RESPONSE_TTL_DAYS = 730


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: FieldKey
    text: ShortText
    type: QuestionType = "text"
    required: bool = True
    options: list[ShortText] = Field(default_factory=list, max_length=12)
    rating_max: int = Field(default=5, ge=2, le=10)


class SurveyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText
    description: MediumText = ""
    active: bool = True
    questions: list[Question] = Field(min_length=1, max_length=30)
    submit_label: ShortText = "Send feedback"
    success_message: MediumText = "Thank you for your feedback!"
    surface: Surface = Field(default_factory=Surface)


class SurveyStored(SurveyConfig):
    survey_id: str
    created_at: str
    updated_at: str
    response_count: int = 0


def _validate(config: SurveyConfig) -> None:
    seen: set[str] = set()
    for q in config.questions:
        if q.key in seen:
            raise BadRequest(f"Duplicate question key '{q.key}'", code="duplicate_question")
        seen.add(q.key)
        if q.type == "choice" and len(q.options) < 2:
            raise BadRequest(
                f"Question '{q.key}' needs at least two options", code="missing_options"
            )


def _to_stored(item: db.Item) -> SurveyStored:
    return SurveyStored.model_validate(
        {k: v for k, v in item.items() if k not in {"PK", "SK", "type"}}
    )


def list_surveys(site_id: str) -> list[SurveyStored]:
    return [
        _to_stored(i) for i in db.query_all(keys.site(site_id), sk_prefix=keys.SK_SURVEY, cap=100)
    ]


def get_survey(site_id: str, survey_id: str) -> SurveyStored:
    item = db.get(keys.site(site_id), f"{keys.SK_SURVEY}{survey_id}")
    if not item:
        raise NotFound("Survey not found", code="survey_not_found")
    return _to_stored(item)


def create_survey(site_id: str, plan: str, config: SurveyConfig) -> SurveyStored:
    _validate(config)
    if len(list_surveys(site_id)) >= plans.limits(plan).max_surveys_per_site:
        raise Forbidden("Survey limit reached for your plan", code="plan_limit")
    now = now_iso()
    sid = new_id()
    stored = SurveyStored(**config.model_dump(), survey_id=sid, created_at=now, updated_at=now)
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_SURVEY}{sid}",
            "type": "survey",
            **stored.model_dump(),
        }
    )
    return stored


def update_survey(site_id: str, survey_id: str, config: SurveyConfig) -> SurveyStored:
    _validate(config)
    existing = get_survey(site_id, survey_id)
    stored = SurveyStored(
        **config.model_dump(),
        survey_id=survey_id,
        created_at=existing.created_at,
        updated_at=now_iso(),
        response_count=existing.response_count,
    )
    db.put(
        {
            "PK": keys.site(site_id),
            "SK": f"{keys.SK_SURVEY}{survey_id}",
            "type": "survey",
            **stored.model_dump(),
        }
    )
    return stored


def delete_survey(site_id: str, survey_id: str) -> None:
    get_survey(site_id, survey_id)
    db.delete_partition(f"{keys.site(site_id)}#{keys.SK_SURVEY}{survey_id}")
    db.delete(keys.site(site_id), f"{keys.SK_SURVEY}{survey_id}")


def public_list(site_id: str) -> list[dict[str, Any]]:
    return [
        {
            "survey_id": s.survey_id,
            "title": s.title,
            "description": s.description,
            "questions": [q.model_dump() for q in s.questions],
            "submit_label": s.submit_label,
            "success_message": s.success_message,
            "surface": s.surface.model_dump(),
        }
        for s in list_surveys(site_id)
        if s.active
    ]


def _partition(site_id: str, survey_id: str) -> str:
    return f"{keys.site(site_id)}#{keys.SK_SURVEY}{survey_id}"


def validate_answers(survey: SurveyStored, raw: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    errors: list[str] = []
    for q in survey.questions:
        value = raw.get(q.key)
        empty = value is None or value == ""
        if empty:
            if q.required:
                errors.append(f"{q.key}:required")
            continue
        if q.type == "rating":
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or not 1 <= value <= q.rating_max
            ):
                errors.append(f"{q.key}:invalid_rating")
            else:
                clean[q.key] = value
        elif q.type == "boolean":
            if isinstance(value, bool):
                clean[q.key] = value
            else:
                errors.append(f"{q.key}:invalid_boolean")
        elif q.type == "choice":
            if value in q.options:
                clean[q.key] = value
            else:
                errors.append(f"{q.key}:invalid_option")
        else:
            text = str(value).strip()
            if len(text) > 2000:
                errors.append(f"{q.key}:too_long")
            else:
                clean[q.key] = text
    if errors:
        raise BadRequest(
            "Validation failed: " + ", ".join(errors),
            code="invalid_submission",
            details=[dict(zip(("field", "message"), e.split(":", 1), strict=True)) for e in errors],
        )
    return clean


def record_response(
    site_id: str, survey: SurveyStored, answers: dict[str, Any], *, now_epoch: int
) -> str:
    rid = new_id()
    db.put(
        {
            "PK": _partition(site_id, survey.survey_id),
            "SK": f"{keys.SK_RESPONSE}{rid}",
            "type": "survey_response",
            "response_id": rid,
            "answers": answers,
            "created_at": now_iso(),
            "expires_at": now_epoch + RESPONSE_TTL_DAYS * 86400,
        }
    )
    db.update(
        keys.site(site_id),
        f"{keys.SK_SURVEY}{survey.survey_id}",
        add_values={"response_count": 1},
    )
    return rid


def results(site_id: str, survey_id: str) -> dict[str, Any]:
    """Aggregate up to the latest 2000 responses (bounded) per question."""
    survey = get_survey(site_id, survey_id)
    items = db.query_all(_partition(site_id, survey_id), sk_prefix=keys.SK_RESPONSE, cap=2000)
    summary: dict[str, Any] = {}
    for q in survey.questions:
        values = [i["answers"][q.key] for i in items if q.key in i["answers"]]
        if q.type == "rating":
            nums = [v for v in values if isinstance(v, int)]
            summary[q.key] = {
                "average": round(sum(nums) / len(nums), 2) if nums else None,
                "distribution": dict(sorted(Counter(nums).items())),
                "count": len(nums),
            }
        elif q.type in {"choice", "boolean"}:
            summary[q.key] = {
                "distribution": dict(Counter(str(v) for v in values)),
                "count": len(values),
            }
        else:
            summary[q.key] = {"samples": [str(v) for v in values[:20]], "count": len(values)}
    return {"survey_id": survey_id, "responses": len(items), "questions": summary}
