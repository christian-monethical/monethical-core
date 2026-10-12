"""Console CRUD for forms/surveys/submissions, CSV export, pagination and db cursor safety."""

from __future__ import annotations

from typing import Any

from conftest import Api

ORIGIN = {"origin": "https://rossi.example.com"}


def test_form_crud(console_a: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    base = f"/v1/sites/{sid}/forms"
    form = console_a.post(base, {"name": "A", "recipients": ["info@rossi.example.com"]})[1]
    assert console_a.get(f"{base}/{form['form_id']}")[1]["name"] == "A"
    upd = console_a.put(
        f"{base}/{form['form_id']}", {"name": "B", "recipients": ["x@rossi.example.com"]}
    )
    assert upd[1]["name"] == "B" and upd[1]["created_at"] == form["created_at"]
    assert [f["name"] for f in console_a.get(base)[1]] == ["B"]
    assert console_a.delete(f"{base}/{form['form_id']}")[0] == 204
    assert console_a.get(f"{base}/{form['form_id']}")[0] == 404
    # free plan: one form only
    console_a.post(base, {"name": "A", "recipients": ["info@rossi.example.com"]})
    assert console_a.post(base, {"name": "C", "recipients": ["i@rossi.example.com"]})[0] == 403


def test_submissions_status_and_delete(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    sid = site_a["site_id"]
    form = console_a.post(
        f"/v1/sites/{sid}/forms", {"name": "A", "recipients": ["info@rossi.example.com"]}
    )[1]
    url = f"/public/{site_a['site_key']}/forms/{form['form_id']}/submit"
    for i in range(3):
        public.post(
            url,
            {"data": {"name": f"Mario {i}", "email": "m@example.com", "message": "Messaggio lungo"}},
            headers=ORIGIN,
            ip=f"198.51.100.{i + 1}",
        )
    page = console_a.get(f"/v1/sites/{sid}/submissions", query={"limit": "2"})[1]
    assert len(page["items"]) == 2 and page["next_cursor"]
    assert page["items"][0]["data"]["name"] == "Mario 2"  # newest first
    rest = console_a.get(
        f"/v1/sites/{sid}/submissions", query={"limit": "2", "cursor": page["next_cursor"]}
    )[1]
    assert [i["data"]["name"] for i in rest["items"]] == ["Mario 0"]
    sub_id = page["items"][0]["submission_id"]
    assert console_a.patch(f"/v1/sites/{sid}/submissions/{sub_id}", {"status": "read"})[0] == 200
    assert console_a.patch(f"/v1/sites/{sid}/submissions/{sub_id}", {"status": "bogus"})[0] == 400
    assert console_a.delete(f"/v1/sites/{sid}/submissions/{sub_id}")[0] == 204
    assert len(console_a.get(f"/v1/sites/{sid}/submissions")[1]["items"]) == 2


def test_cursor_from_another_partition_is_rejected(
    console_a: Api, console_b: Api, public: Api, site_a: dict[str, Any]
) -> None:
    sid = site_a["site_id"]
    for i in range(3):
        public.post(
            f"/public/{site_a['site_key']}/consent",
            {"banner_version": 1},
            headers=ORIGIN,
            ip=f"198.51.100.{i + 1}",
        )
    cursor = console_a.get(f"/v1/sites/{sid}/consents", query={"limit": "1"})[1]["next_cursor"]
    other = console_b.post("/v1/sites", {"name": "B", "domains": ["b.example.com"]})[1]
    status, data, _ = console_b.get(
        f"/v1/sites/{other['site_id']}/consents", query={"cursor": cursor}
    )
    assert status == 400 and data["error"]["code"] == "invalid_cursor"
    assert console_a.get(f"/v1/sites/{sid}/consents", query={"cursor": "garbage"})[0] == 400


def test_consent_csv_export_neutralizes_formulas(
    console_a: Api, public: Api, site_a: dict[str, Any]
) -> None:
    sid = site_a["site_id"]
    public.post(
        f"/public/{site_a['site_key']}/consent",
        {"banner_version": 1, "analytics": True},
        headers={**ORIGIN, "user-agent": "=HYPERLINK(\"http://evil\")"},
    )
    status, body, headers = console_a.get(f"/v1/sites/{sid}/consents.csv")
    assert status == 200 and headers["Content-Type"].startswith("text/csv")
    assert "consent_id,created_at" in body
    assert "'=HYPERLINK" in body and ",=HYPERLINK" not in body


def test_survey_crud_and_validation(console_a: Api, site_a: dict[str, Any]) -> None:
    sid = site_a["site_id"]
    base = f"/v1/sites/{sid}/surveys"
    q = [{"key": "a", "text": "Voto", "type": "rating"}]
    survey = console_a.post(base, {"title": "S", "questions": q})[1]
    assert (
        console_a.post(base, {"title": "T", "questions": [q[0], q[0]]})[1]["error"]["code"]
        == "duplicate_question"
    )
    bad_choice = [{"key": "c", "text": "Scelta", "type": "choice", "options": ["solo uno"]}]
    assert (
        console_a.post(base, {"title": "T", "questions": bad_choice})[1]["error"]["code"]
        == "missing_options"
    )
    upd = console_a.put(f"{base}/{survey['survey_id']}", {"title": "Nuovo", "questions": q})
    assert upd[1]["title"] == "Nuovo"
    assert console_a.delete(f"{base}/{survey['survey_id']}")[0] == 204
    assert console_a.get(base)[1] == []


def test_snapshot_removed_when_site_paused(console_a: Api, site_a: dict[str, Any]) -> None:
    import boto3
    from botocore.exceptions import ClientError
    from conftest import BUCKET

    key = f"config/{site_a['site_key']}/site.json"
    s3 = boto3.client("s3")
    assert s3.head_object(Bucket=BUCKET, Key=key)
    console_a.patch(f"/v1/sites/{site_a['site_id']}", {"status": "paused"})
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        raise AssertionError("snapshot must be removed for paused sites")
    except ClientError as exc:
        assert exc.response["Error"]["Code"] in {"404", "NoSuchKey"}
    console_a.patch(f"/v1/sites/{site_a['site_id']}", {"status": "active"})
    assert s3.head_object(Bucket=BUCKET, Key=key)


def test_analytics_summary_shape(console_a: Api, site_a: dict[str, Any]) -> None:
    data = console_a.get(f"/v1/sites/{site_a['site_id']}/analytics", query={"days": "7"})[1]
    assert data["days"] == 7 and len(data["series"]) == 7
    assert console_a.get(f"/v1/sites/{site_a['site_id']}/analytics", query={"days": "999"})[0] == 400


def test_origin_helpers() -> None:
    import pytest
    from monethical.core.errors import BadRequest
    from monethical.core.origin import host_allowed, host_of, normalize_domain

    assert normalize_domain("HTTPS://WWW.Example.com/path") == "www.example.com"
    assert normalize_domain("*.example.com") == "*.example.com"
    with pytest.raises(BadRequest):
        normalize_domain("exa mple")
    assert host_allowed("a.example.com", ["*.example.com"])
    assert host_allowed("example.com", ["*.example.com"])
    assert not host_allowed("evilexample.com", ["*.example.com"])
    assert not host_allowed("", ["example.com"])
    assert host_of("https://User@Example.com:8443/x") == "example.com"
    assert host_of("not a url") == ""
