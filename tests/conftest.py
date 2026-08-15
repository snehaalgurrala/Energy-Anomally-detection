"""Shared fixtures for the API test suite.

The suite runs against the real FastAPI app (src/api.py) with its real
lifespan startup, so it reads the actual results/anomaly_results.parquet
and data/*.csv files already on disk -- no fixtures/mocks for detector,
pipeline, or feature-engineering data. The only thing ever monkeypatched
is the OpenRouter call itself (src.api.complete) and, for the 503 case,
the OPENROUTER_API_KEY environment variable -- both in tests/test_ai_endpoints.py.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from src.api import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient bound to the real app, run through its actual lifespan
    (loads the Parquet results and builds the household feature tables
    once, same as `uvicorn src.api:app`). Session-scoped since that startup
    cost is real and shouldn't be paid per test.
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def sample_anomaly(client):
    """A real (meter, day) pair known to have an anomaly, fetched through
    the public API itself so tests never reach into internal data-access
    functions to manufacture one.
    """
    response = client.get("/api/anomalies", params={"page_size": 1})
    row = response.json()["rows"][0]
    return row["LCLid"], row["day"]


@pytest.fixture(scope="session")
def sample_household(client):
    """A real LCLid from the household feature sample (data/block_0.csv),
    fetched through the public API itself for the same reason as
    sample_anomaly above.
    """
    response = client.get("/api/households", params={"page_size": 1})
    return response.json()["rows"][0]["LCLid"]
