"""Regression coverage for anomaly-list filtering/sorting/pagination and the
anomaly-aggregate endpoints (monthly-trend, segments, by-household).

Basic shape/404/422 checks for /api/summary, /api/anomalies, and
/api/anomalies/{meter}/{day} already live in test_core_endpoints.py and are
not repeated here.
"""


def test_anomalies_filter_by_meter_and_date_range(client, sample_anomaly):
    meter, day = sample_anomaly

    response = client.get(
        "/api/anomalies",
        params={"meter": meter, "start_date": day, "end_date": day},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["rows"][0]["LCLid"] == meter
    assert body["rows"][0]["day"] == day


def test_anomalies_filter_by_anomaly_type(client):
    response = client.get(
        "/api/anomalies", params={"anomaly_type": "Drop", "page_size": 50}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    assert all(row["anomaly_type"] == "Drop" for row in body["rows"])


def test_anomalies_sorting_respects_direction(client):
    asc = client.get(
        "/api/anomalies",
        params={"sort_by": "hybrid_score", "ascending": True, "page_size": 20},
    ).json()["rows"]
    desc = client.get(
        "/api/anomalies",
        params={"sort_by": "hybrid_score", "ascending": False, "page_size": 20},
    ).json()["rows"]

    asc_scores = [row["hybrid_score"] for row in asc]
    desc_scores = [row["hybrid_score"] for row in desc]

    assert asc_scores == sorted(asc_scores)
    assert desc_scores == sorted(desc_scores, reverse=True)
    assert asc_scores[0] != desc_scores[0]


def test_anomalies_pagination_pages_do_not_overlap(client):
    page1 = client.get("/api/anomalies", params={"page": 1, "page_size": 10}).json()
    page2 = client.get("/api/anomalies", params={"page": 2, "page_size": 10}).json()

    assert page1["page"] == 1
    assert page2["page"] == 2
    assert len(page1["rows"]) == 10
    assert len(page2["rows"]) == 10

    ids1 = {(row["LCLid"], row["day"]) for row in page1["rows"]}
    ids2 = {(row["LCLid"], row["day"]) for row in page2["rows"]}
    assert ids1.isdisjoint(ids2)


def test_anomaly_detail_returns_matching_record(client, sample_anomaly):
    meter, day = sample_anomaly

    response = client.get(f"/api/anomalies/{meter}/{day}")

    assert response.status_code == 200
    body = response.json()
    assert body["LCLid"] == meter
    assert body["day"] == day


def test_anomalies_monthly_trend_shape(client):
    response = client.get("/api/anomalies/monthly-trend")

    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) > 0
    for row in rows:
        assert row["anomaly_count"] == row["spike_count"] + row["drop_count"]
        assert row["eligible_count"] >= row["anomaly_count"]


def test_anomalies_segments_shape(client):
    response = client.get("/api/anomalies/segments")

    assert response.status_code == 200
    body = response.json()
    assert len(body["by_acorn_group"]) > 0
    assert len(body["by_tariff"]) > 0
    for row in body["by_acorn_group"] + body["by_tariff"]:
        assert row["anomaly_count"] == row["spike_count"] + row["drop_count"]


def test_anomalies_by_household_sorted_descending(client):
    response = client.get(
        "/api/anomalies/by-household",
        params={"sort_by": "anomaly_count", "ascending": False, "page_size": 20},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    counts = [row["anomaly_count"] for row in body["rows"]]
    assert counts == sorted(counts, reverse=True)
