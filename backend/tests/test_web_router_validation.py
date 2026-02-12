from fastapi import HTTPException
from pydantic import ValidationError

from app.routers.web import InteractionRequest, ResearchRequest, WebVisitRequest, require_web_api_key


def test_web_visit_request_requires_valid_url():
    request = WebVisitRequest(url="https://example.com")
    assert str(request.url) == "https://example.com/"

    try:
        WebVisitRequest(url="not-a-url")
        assert False, "Expected ValidationError for invalid URL"
    except ValidationError:
        assert True


def test_research_request_enforces_bounds():
    valid = ResearchRequest(query="test", max_results=5)
    assert valid.max_results == 5

    try:
        ResearchRequest(query="x", max_results=5)
        assert False, "Expected ValidationError for short query"
    except ValidationError:
        assert True

    try:
        ResearchRequest(query="valid query", max_results=99)
        assert False, "Expected ValidationError for max_results upper bound"
    except ValidationError:
        assert True


def test_interaction_direction_validator():
    down = InteractionRequest(direction="down")
    up = InteractionRequest(direction="up")
    assert down.direction == "down"
    assert up.direction == "up"

    try:
        InteractionRequest(direction="left")
        assert False, "Expected ValidationError for invalid direction"
    except ValidationError:
        assert True


def test_require_web_api_key_no_env(monkeypatch):
    monkeypatch.delenv("LOOM_WEB_API_KEY", raising=False)
    require_web_api_key(None)


def test_require_web_api_key_with_env(monkeypatch):
    monkeypatch.setenv("LOOM_WEB_API_KEY", "secret")

    require_web_api_key("secret")

    try:
        require_web_api_key("wrong")
        assert False, "Expected HTTPException for invalid key"
    except HTTPException as exc:
        assert exc.status_code == 401
