"""Coverage for the household AI explain endpoint, mirroring
tests/test_ai_endpoints.py's approach: src.api.complete is monkeypatched
with a stub so no real OpenRouter call is ever made.
"""

STUBBED_ANALYSIS = "stubbed household analysis text"


def _stub_complete(system_prompt: str, user_prompt: str) -> str:
    return STUBBED_ANALYSIS


def _fail_if_called(*args, **kwargs):
    raise AssertionError("complete() should not be called on this path")


def test_household_explain_success(client, sample_household, monkeypatch):
    monkeypatch.setattr("src.api.complete", _stub_complete)

    response = client.post(f"/api/ai/households/{sample_household}/explain", json={})

    assert response.status_code == 200
    assert response.json() == {"analysis": STUBBED_ANALYSIS}


def test_household_explain_accepts_custom_question(client, sample_household, monkeypatch):
    monkeypatch.setattr("src.api.complete", _stub_complete)

    response = client.post(
        f"/api/ai/households/{sample_household}/explain",
        json={"question": "How variable is this household's consumption?"},
    )

    assert response.status_code == 200
    assert response.json() == {"analysis": STUBBED_ANALYSIS}


def test_household_explain_404_for_unknown_meter(client, monkeypatch):
    monkeypatch.setattr("src.api.complete", _fail_if_called)

    response = client.post("/api/ai/households/NOT_A_REAL_METER/explain", json={})

    assert response.status_code == 404


def test_household_explain_422_for_malformed_body(client, sample_household):
    response = client.post(
        f"/api/ai/households/{sample_household}/explain", json={"question": 123}
    )

    assert response.status_code == 422


def test_household_explain_503_when_api_key_missing(client, sample_household, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post(f"/api/ai/households/{sample_household}/explain", json={})

    assert response.status_code == 503
