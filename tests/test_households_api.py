"""Regression coverage for household-list filtering/sorting/pagination and
the per-household endpoints (detail, daily history, monthly-trend).

The dataset backing these endpoints (data/block_0.csv) is a fixed, local
50-household sample, so the exact totals asserted below are stable
regression values, not incidental.

Basic shape checks for /api/households/summary already live in
test_core_endpoints.py and are not repeated here.
"""


def test_households_pagination(client):
    response = client.get("/api/households", params={"page_size": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 10
    assert len(body["rows"]) == 10
    assert body["total"] == 50


def test_households_sorting_ascending(client):
    response = client.get(
        "/api/households",
        params={"sort_by": "average_daily_consumption", "ascending": True, "page_size": 50},
    )

    assert response.status_code == 200
    values = [row["average_daily_consumption"] for row in response.json()["rows"]]
    assert values == sorted(values)


def test_households_filter_by_tariff(client):
    response = client.get("/api/households", params={"stdorToU": "ToU", "page_size": 50})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert all(row["stdorToU"] == "ToU" for row in body["rows"])


def test_households_filter_by_acorn_group(client):
    response = client.get(
        "/api/households", params={"Acorn_grouped": "Affluent", "page_size": 50}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 48
    assert all(row["Acorn_grouped"] == "Affluent" for row in body["rows"])


def test_households_monthly_trend_shape(client):
    response = client.get("/api/households/monthly-trend")

    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) > 0
    assert {"month", "average_daily_consumption", "household_day_count"} <= rows[0].keys()


def test_household_detail_returns_matching_record(client, sample_household):
    response = client.get(f"/api/households/{sample_household}")

    assert response.status_code == 200
    assert response.json()["LCLid"] == sample_household


def test_household_detail_404_for_unknown_meter(client):
    response = client.get("/api/households/NOT_A_REAL_METER")

    assert response.status_code == 404


def test_household_daily_returns_matching_rows(client, sample_household):
    response = client.get(
        f"/api/households/{sample_household}/daily", params={"page_size": 5}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    assert len(body["rows"]) <= 5
    assert all(row["LCLid"] == sample_household for row in body["rows"])


def test_household_daily_date_range_filter(client, sample_household):
    first_page = client.get(
        f"/api/households/{sample_household}/daily", params={"page_size": 1}
    ).json()
    target_date = first_page["rows"][0]["date"]

    response = client.get(
        f"/api/households/{sample_household}/daily",
        params={"start_date": target_date, "end_date": target_date},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["rows"][0]["date"] == target_date


def test_household_daily_404_for_unknown_meter(client):
    response = client.get("/api/households/NOT_A_REAL_METER/daily")

    assert response.status_code == 404
