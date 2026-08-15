"""Coverage for the two AI endpoints (anomaly explain, dashboard explain).

None of these tests call the real OpenRouter API:

  * "success" cases monkeypatch src.api.complete (the single function that
    talks to OpenRouter -- see src/ai/llm_client.py) with a stub, so the
    endpoint's own routing/context/response-mapping logic is exercised
    without any network call.
  * the 503 cases remove OPENROUTER_API_KEY from the environment instead.
    llm_client.complete() checks for the key before doing any network I/O
    and raises LlmConfigurationError immediately, which src/api.py maps to
    503 -- so this exercises the real error-mapping path with no network
    call and no API key ever required.
"""

STUBBED_ANALYSIS = "stubbed analysis text"


def _stub_complete(system_prompt: str, user_prompt: str) -> str:
    return STUBBED_ANALYSIS


def _fail_if_called(*args, **kwargs):
    raise AssertionError("complete() should not be called on this path")


def test_anomaly_explain_success(client, sample_anomaly, monkeypatch):
    monkeypatch.setattr("src.api.complete", _stub_complete)
    meter, day = sample_anomaly

    response = client.post(f"/api/ai/anomalies/{meter}/{day}/explain", json={})

    assert response.status_code == 200
    assert response.json() == {"analysis": STUBBED_ANALYSIS}


def test_anomaly_explain_accepts_custom_question(client, sample_anomaly, monkeypatch):
    monkeypatch.setattr("src.api.complete", _stub_complete)
    meter, day = sample_anomaly

    response = client.post(
        f"/api/ai/anomalies/{meter}/{day}/explain",
        json={"question": "Was this a spike or a drop?"},
    )

    assert response.status_code == 200
    assert response.json() == {"analysis": STUBBED_ANALYSIS}


def test_anomaly_explain_404_for_unknown_meter_and_day(client, monkeypatch):
    monkeypatch.setattr("src.api.complete", _fail_if_called)

    response = client.post(
        "/api/ai/anomalies/NOT_A_REAL_METER/2013-01-01/explain", json={}
    )

    assert response.status_code == 404


def test_anomaly_explain_422_for_malformed_body(client, sample_anomaly):
    meter, day = sample_anomaly

    response = client.post(
        f"/api/ai/anomalies/{meter}/{day}/explain", json={"question": 123}
    )

    assert response.status_code == 422


def test_anomaly_explain_503_when_api_key_missing(client, sample_anomaly, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    meter, day = sample_anomaly

    response = client.post(f"/api/ai/anomalies/{meter}/{day}/explain", json={})

    assert response.status_code == 503


def test_dashboard_explain_success(client, monkeypatch):
    monkeypatch.setattr("src.api.complete", _stub_complete)

    response = client.post("/api/ai/dashboard/explain", json={})

    assert response.status_code == 200
    assert response.json() == {"analysis": STUBBED_ANALYSIS}


def test_dashboard_explain_422_for_malformed_body(client):
    response = client.post("/api/ai/dashboard/explain", json={"question": 123})

    assert response.status_code == 422


def test_dashboard_explain_503_when_api_key_missing(client, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/ai/dashboard/explain", json={})

    assert response.status_code == 503
