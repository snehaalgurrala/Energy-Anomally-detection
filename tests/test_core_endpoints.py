"""Regression coverage for the core, non-AI read endpoints."""


def test_summary_returns_expected_shape(client):
    response = client.get("/api/summary")

    assert response.status_code == 200
    body = response.json()
    assert body.keys() == {
        "total_meters",
        "total_records",
        "eligible_records",
        "anomaly_count",
        "anomaly_rate_pct",
        "spike_count",
        "drop_count",
    }
    assert body["total_meters"] > 0
    assert body["total_records"] > 0


def test_anomalies_returns_paginated_rows(client):
    response = client.get("/api/anomalies", params={"page_size": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 5
    assert body["total"] >= len(body["rows"])
    assert len(body["rows"]) <= 5
    if body["rows"]:
        row = body["rows"][0]
        assert {"LCLid", "day", "anomaly_status", "anomaly_type"} <= row.keys()


def test_households_summary_returns_expected_shape(client):
    response = client.get("/api/households/summary")

    assert response.status_code == 200
    body = response.json()
    assert body.keys() == {
        "total_meters",
        "total_half_hourly_readings",
        "date_range_start",
        "date_range_end",
        "total_daily_records",
        "average_daily_consumption",
        "average_household_daily_consumption",
        "missing_energy_readings",
        "incomplete_days",
    }
    assert body["total_meters"] > 0


def test_anomaly_detail_404_for_unknown_meter_and_day(client):
    response = client.get("/api/anomalies/NOT_A_REAL_METER/2013-01-01")

    assert response.status_code == 404
    assert "NOT_A_REAL_METER" in response.json()["detail"]


def test_anomalies_422_for_invalid_page(client):
    response = client.get("/api/anomalies", params={"page": 0})

    assert response.status_code == 422


def test_anomalies_422_for_invalid_sort_by(client):
    response = client.get("/api/anomalies", params={"sort_by": "not_a_column"})

    assert response.status_code == 422
