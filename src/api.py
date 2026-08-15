"""Read-only FastAPI backend for the anomaly-detection dashboard and the
household analytics layer.

This module contains no detection logic and no feature-engineering logic of
its own:

  * the anomaly endpoints are thin wrappers around src/results_store.py's
    query functions, which read the already-generated
    results/anomaly_results.parquet.
  * the household endpoints are thin wrappers around src/household_features.py
    (which itself builds on src/household_consumption.py), reading directly
    from data/block_0.csv and data/informations_households.csv.

Both the anomaly results and the household feature tables are loaded once,
at process startup (see `lifespan` below), and reused by every request.

Run locally from the repo root:

    uvicorn src.api:app --reload
"""

import json
import sys
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from time import perf_counter
from typing import Literal

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Loads the repo-root .env (e.g. OPENROUTER_API_KEY) into the process
# environment once, at import time -- before ai.llm_client.complete() ever
# reads os.environ. Must run before any project import that could need it.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from src.results_store import (  # noqa: E402
    get_anomaly_detail,
    get_high_anomaly_households,
    get_meter_history,
    get_monthly_anomaly_trend,
    get_summary,
    list_anomalies,
    load_results,
)

# Sibling modules under src/ use bare imports (e.g. `from household_consumption
# import ...`) so they can also be run standalone (`python src/household_features.py`).
# Adding this file's own directory to sys.path lets api.py reuse them unchanged
# via the same bare-import style -- same approach as src/pipeline.py.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ai.anomaly_context import SYSTEM_PROMPT, build_anomaly_explanation_context  # noqa: E402
from ai.dashboard_context import (  # noqa: E402
    SYSTEM_PROMPT as DASHBOARD_SYSTEM_PROMPT,
    TOP_HIGH_ANOMALY_HOUSEHOLDS,
    build_dashboard_context,
)
from ai.llm_client import (  # noqa: E402
    LlmConfigurationError,
    LlmRequestError,
    LlmResponseError,
    LlmTimeoutError,
    complete,
)
from anomaly_segmentation import build_anomaly_segment_summary  # noqa: E402
from household_consumption import load_block, load_households  # noqa: E402
from household_features import (  # noqa: E402
    build_daily_features,
    build_half_hourly_features,
    build_household_summary,
    build_monthly_trend,
    build_validation_report,
)

# Origin of the local Next.js dev server this API is built to serve.
# Update this if the frontend runs on a different host/port.
NEXTJS_DEV_ORIGIN = "http://localhost:3000"

SortColumn = Literal["hybrid_score", "statistical_score", "if_score", "deviation", "day"]

HighAnomalySortColumn = Literal[
    "anomaly_count",
    "spike_count",
    "drop_count",
    "anomaly_rate_pct",
    "avg_hybrid_score",
    "max_hybrid_score",
    "latest_anomaly_date",
]

HouseholdSortColumn = Literal[
    "LCLid",
    "average_daily_consumption",
    "median_daily_consumption",
    "max_daily_consumption",
    "minimum_daily_consumption",
    "consumption_std",
    "consumption_variability",
    "average_weekday_consumption",
    "average_weekend_consumption",
    "weekend_vs_weekday_ratio",
]


# Populated once by _load_anomaly_aggregates() at process startup; reused by
# the Phase 3 anomaly-intelligence endpoints. Not touched by the household
# endpoints below.
_anomaly_cache: dict = {}


def _load_anomaly_aggregates() -> None:
    """Precompute the anomaly-side aggregations once, at process startup --
    same reasoning as _load_household_data() below. Reuses the already-cached
    results DataFrame (results_store.load_results(), loaded just before this
    is called); no re-read of the Parquet file, no detector/pipeline logic.
    """
    monthly_df = get_monthly_anomaly_trend()
    _anomaly_cache["monthly_trend"] = AnomalyMonthlyTrendResponse(
        rows=[
            AnomalyMonthlyTrendRecord(
                month=row["month"].date(),
                eligible_count=row["eligible_count"],
                anomaly_count=row["anomaly_count"],
                spike_count=row["spike_count"],
                drop_count=row["drop_count"],
            )
            for row in monthly_df.to_dict(orient="records")
        ]
    )

    _anomaly_cache["segments"] = AnomalySegmentSummaryResponse(
        by_acorn_group=[
            AnomalySegmentRecord(**row)
            for row in build_anomaly_segment_summary("Acorn_grouped").to_dict(orient="records")
        ],
        by_tariff=[
            AnomalySegmentRecord(**row)
            for row in build_anomaly_segment_summary("stdorToU").to_dict(orient="records")
        ],
    )

    # Kept as a raw DataFrame (not a Pydantic response) so /api/anomalies/by-household
    # can sort/paginate it per-request, the same way _household_cache["household_df"]
    # is sorted/paginated per-request by /api/households.
    _anomaly_cache["household_rollup_df"] = get_high_anomaly_households()


# Populated once by _load_household_data() at process startup; reused by
# every household request. Not touched by the anomaly endpoints above.
_household_cache: dict = {}


def _load_household_data() -> None:
    """Build the household feature tables once, at process startup.

    The 1.22M-row half-hourly table is only needed to derive the daily and
    household-summary tables and the dataset-level validation stats below;
    it is not resident afterwards, since no endpoint queries it directly.
    """
    t0 = perf_counter()
    block_df = load_block()
    households_df = load_households()
    half_hourly_df = build_half_hourly_features(block_df, households_df)
    daily_df = build_daily_features(half_hourly_df)
    household_df = build_household_summary(daily_df)
    monthly_trend_df = build_monthly_trend(daily_df)
    validation = build_validation_report(block_df, half_hourly_df, daily_df, household_df, timings={})

    _household_cache["daily_df"] = daily_df
    _household_cache["household_df"] = household_df
    _household_cache["monthly_trend"] = HouseholdMonthlyTrendResponse(
        rows=[
            HouseholdMonthlyTrendRecord(
                month=row["month"].date(),
                average_daily_consumption=_none_if_nan(row["average_daily_consumption"]),
                household_day_count=int(row["household_day_count"]),
            )
            for row in monthly_trend_df.to_dict(orient="records")
        ]
    )
    _household_cache["summary"] = HouseholdDatasetSummaryResponse(
        total_meters=validation["meters"],
        total_half_hourly_readings=validation["output_rows_half_hourly"],
        date_range_start=validation["date_min"].date(),
        date_range_end=validation["date_max"].date(),
        total_daily_records=len(daily_df),
        average_daily_consumption=_none_if_nan(daily_df["daily_total"].mean()),
        average_household_daily_consumption=_none_if_nan(household_df["average_daily_consumption"].mean()),
        missing_energy_readings=validation["missing_energy_values"],
        incomplete_days=validation["incomplete_days"],
    )

    elapsed = perf_counter() - t0
    print(
        f"Household feature layer loaded in {elapsed:.2f}s "
        f"({validation['meters']} meters, {len(daily_df)} daily records)"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_results()  # cold-load the Parquet file once at startup, not on the first request
    _load_anomaly_aggregates()  # cold-build the anomaly-side aggregations once at startup
    _load_household_data()  # cold-build the household feature tables once at startup
    yield


app = FastAPI(title="Energy Anomaly Detection API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[NEXTJS_DEV_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class SummaryResponse(BaseModel):
    total_meters: int
    total_records: int
    eligible_records: int
    anomaly_count: int
    anomaly_rate_pct: float
    spike_count: int
    drop_count: int


class AnomalyRecord(BaseModel):
    LCLid: str
    day: date
    energy_sum: float
    expected_consumption: float | None
    deviation: float | None
    statistical_score: float | None
    statistical_evidence: float | None
    if_score: float | None
    if_evidence: float | None
    hybrid_score: float | None
    anomaly_status: str | None
    anomaly_type: str | None
    confidence: str | None
    is_complete_day: bool
    eligibility_status: str


class AnomalyListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    rows: list[AnomalyRecord]


class AnomalyMonthlyTrendRecord(BaseModel):
    month: date
    eligible_count: int
    anomaly_count: int
    spike_count: int
    drop_count: int


class AnomalyMonthlyTrendResponse(BaseModel):
    rows: list[AnomalyMonthlyTrendRecord]


class HighAnomalyHouseholdRecord(BaseModel):
    LCLid: str
    anomaly_count: int
    spike_count: int
    drop_count: int
    eligible_count: int
    anomaly_rate_pct: float
    latest_anomaly_date: date
    avg_hybrid_score: float | None
    max_hybrid_score: float | None


class HighAnomalyHouseholdListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    rows: list[HighAnomalyHouseholdRecord]


class AnomalySegmentRecord(BaseModel):
    segment: str
    household_count: int
    eligible_count: int
    anomaly_count: int
    spike_count: int
    drop_count: int
    anomaly_rate_pct: float


class AnomalySegmentSummaryResponse(BaseModel):
    by_acorn_group: list[AnomalySegmentRecord]
    by_tariff: list[AnomalySegmentRecord]


class AnomalyExplanationRequest(BaseModel):
    question: str | None = None


class AnomalyExplanationResponse(BaseModel):
    analysis: str


class DashboardExplanationRequest(BaseModel):
    question: str | None = None


class DashboardExplanationResponse(BaseModel):
    analysis: str


class HouseholdDatasetSummaryResponse(BaseModel):
    total_meters: int
    total_half_hourly_readings: int
    date_range_start: date
    date_range_end: date
    total_daily_records: int
    average_daily_consumption: float | None
    average_household_daily_consumption: float | None
    missing_energy_readings: int
    incomplete_days: int


class HouseholdMonthlyTrendRecord(BaseModel):
    month: date
    average_daily_consumption: float | None
    household_day_count: int


class HouseholdMonthlyTrendResponse(BaseModel):
    rows: list[HouseholdMonthlyTrendRecord]


class HouseholdSummaryRecord(BaseModel):
    LCLid: str
    stdorToU: str | None
    Acorn: str | None
    Acorn_grouped: str | None
    average_daily_consumption: float | None
    median_daily_consumption: float | None
    max_daily_consumption: float | None
    minimum_daily_consumption: float | None
    consumption_std: float | None
    consumption_variability: float | None
    average_weekday_consumption: float | None
    average_weekend_consumption: float | None
    weekend_vs_weekday_ratio: float | None


class HouseholdListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    rows: list[HouseholdSummaryRecord]


class DailyFeatureRecord(BaseModel):
    LCLid: str
    date: date
    day_of_week: int
    day_name: str
    week: int
    month: int
    month_name: str
    season: str
    is_weekend: bool
    stdorToU: str | None
    Acorn: str | None
    Acorn_grouped: str | None
    daily_total: float | None
    daily_mean: float | None
    daily_min: float | None
    daily_max: float | None
    daily_std: float | None
    daily_median: float | None
    reading_count: int
    missing_reading_count: int
    zero_reading_count: int
    expected_reading_count: int
    completeness_rate: float
    zero_reading_rate: float | None
    minimum_consumption: float | None
    peak_hour: int | None
    peak_consumption: float | None
    morning_consumption: float | None
    afternoon_consumption: float | None
    evening_consumption: float | None
    overnight_consumption: float | None


class DailyFeatureListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    rows: list[DailyFeatureRecord]


def _none_if_nan(value: float) -> float | None:
    return None if pd.isna(value) else float(value)


def _clean_row(row: dict) -> dict:
    """NaN -> None for one pandas record dict, ahead of Pydantic validation.
    Shared by every row-serializer below (anomaly, household, daily) -- this
    is response serialization, not detector or feature-layer logic."""
    return {k: (None if pd.isna(v) else v) for k, v in row.items()}


def _to_record(row: dict) -> AnomalyRecord:
    """Convert one results_store record dict into an AnomalyRecord.

    pandas represents the `day` timestamp in a way Pydantic won't accept
    as-is (a Timestamp instead of a date), so it's normalized here -- this
    is response serialization, not result-store logic.
    """
    clean = _clean_row(row)
    clean["day"] = row["day"].date()
    return AnomalyRecord(**clean)


def _to_high_anomaly_household_record(row: dict) -> HighAnomalyHouseholdRecord:
    clean = _clean_row(row)
    clean["latest_anomaly_date"] = row["latest_anomaly_date"].date()
    return HighAnomalyHouseholdRecord(**clean)


def _to_household_record(row: dict) -> HouseholdSummaryRecord:
    return HouseholdSummaryRecord(**_clean_row(row))


def _to_daily_record(row: dict) -> DailyFeatureRecord:
    clean = _clean_row(row)
    clean["date"] = row["date"].date()
    return DailyFeatureRecord(**clean)


def _paginate(df: pd.DataFrame, page: int, page_size: int) -> pd.DataFrame:
    start = (page - 1) * page_size
    return df.iloc[start : start + page_size]


@app.get("/api/summary", response_model=SummaryResponse)
def summary() -> dict:
    return get_summary()


@app.get("/api/anomalies", response_model=AnomalyListResponse)
def anomalies(
    meter: str | None = None,
    anomaly_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    sort_by: SortColumn = "hybrid_score",
    ascending: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> AnomalyListResponse:
    result = list_anomalies(
        meter=meter,
        anomaly_type=anomaly_type,
        start_date=start_date,
        end_date=end_date,
        sort_by=sort_by,
        ascending=ascending,
        page=page,
        page_size=page_size,
    )
    return AnomalyListResponse(
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        rows=[_to_record(row) for row in result["rows"]],
    )


@app.get("/api/anomalies/monthly-trend", response_model=AnomalyMonthlyTrendResponse)
def anomalies_monthly_trend() -> AnomalyMonthlyTrendResponse:
    return _anomaly_cache["monthly_trend"]


@app.get("/api/anomalies/segments", response_model=AnomalySegmentSummaryResponse)
def anomalies_segments() -> AnomalySegmentSummaryResponse:
    return _anomaly_cache["segments"]


@app.get("/api/anomalies/by-household", response_model=HighAnomalyHouseholdListResponse)
def anomalies_by_household(
    sort_by: HighAnomalySortColumn = "anomaly_count",
    ascending: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> HighAnomalyHouseholdListResponse:
    df = _anomaly_cache["household_rollup_df"]
    total = len(df)
    df = df.sort_values(sort_by, ascending=ascending)
    page_df = _paginate(df, page, page_size)

    return HighAnomalyHouseholdListResponse(
        total=total,
        page=page,
        page_size=page_size,
        rows=[_to_high_anomaly_household_record(row) for row in page_df.to_dict(orient="records")],
    )


@app.get("/api/meters/{meter}/history", response_model=list[AnomalyRecord])
def meter_history(meter: str) -> list[AnomalyRecord]:
    try:
        rows = get_meter_history(meter)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [_to_record(row) for row in rows]


@app.get("/api/anomalies/{meter}/{day}", response_model=AnomalyRecord)
def anomaly_detail(meter: str, day: date) -> AnomalyRecord:
    try:
        row = get_anomaly_detail(meter, day.isoformat())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _to_record(row)


DEFAULT_EXPLANATION_QUESTION = (
    "Explain this anomaly using the supplied data. Summarize what happened, "
    "how unusual it was, and the most relevant evidence."
)


@app.post("/api/ai/anomalies/{meter}/{day}/explain", response_model=AnomalyExplanationResponse)
def anomaly_explain(
    meter: str,
    day: date,
    request: AnomalyExplanationRequest = AnomalyExplanationRequest(),
) -> AnomalyExplanationResponse:
    try:
        context = build_anomaly_explanation_context(meter, day.isoformat())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    question = request.question or DEFAULT_EXPLANATION_QUESTION
    user_prompt = f"Context:\n{json.dumps(context)}\n\nQuestion: {question}"

    try:
        analysis = complete(SYSTEM_PROMPT, user_prompt)
    except LlmConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except LlmTimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except (LlmRequestError, LlmResponseError) as e:
        raise HTTPException(status_code=502, detail=str(e))

    return AnomalyExplanationResponse(analysis=analysis)


# --- Household analytics (read-only, block_0.csv-derived) ------------------
#
# NOTE: /api/households/summary must be registered before /api/households/{meter}
# so "summary" is routed as the summary endpoint, not captured as a meter path
# parameter -- FastAPI matches routes in registration order.


@app.get("/api/households/summary", response_model=HouseholdDatasetSummaryResponse)
def households_summary() -> HouseholdDatasetSummaryResponse:
    return _household_cache["summary"]


@app.get("/api/households/monthly-trend", response_model=HouseholdMonthlyTrendResponse)
def households_monthly_trend() -> HouseholdMonthlyTrendResponse:
    return _household_cache["monthly_trend"]


@app.get("/api/households", response_model=HouseholdListResponse)
def households(
    stdorToU: str | None = None,
    Acorn_grouped: str | None = None,
    sort_by: HouseholdSortColumn = "LCLid",
    ascending: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> HouseholdListResponse:
    df = _household_cache["household_df"]
    if stdorToU is not None:
        df = df[df["stdorToU"] == stdorToU]
    if Acorn_grouped is not None:
        df = df[df["Acorn_grouped"] == Acorn_grouped]

    total = len(df)
    df = df.sort_values(sort_by, ascending=ascending)
    page_df = _paginate(df, page, page_size)

    return HouseholdListResponse(
        total=total,
        page=page,
        page_size=page_size,
        rows=[_to_household_record(row) for row in page_df.to_dict(orient="records")],
    )


@app.get("/api/households/{meter}", response_model=HouseholdSummaryRecord)
def household_detail(meter: str) -> HouseholdSummaryRecord:
    df = _household_cache["household_df"]
    match = df[df["LCLid"] == meter]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"No household found for meter {meter!r}.")
    return _to_household_record(match.iloc[0].to_dict())


@app.get("/api/households/{meter}/daily", response_model=DailyFeatureListResponse)
def household_daily(
    meter: str,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> DailyFeatureListResponse:
    df = _household_cache["daily_df"]
    rows = df[df["LCLid"] == meter]
    if rows.empty:
        raise HTTPException(status_code=404, detail=f"No household found for meter {meter!r}.")

    if start_date is not None:
        rows = rows[rows["date"] >= pd.Timestamp(start_date)]
    if end_date is not None:
        rows = rows[rows["date"] <= pd.Timestamp(end_date)]

    total = len(rows)
    rows = rows.sort_values("date")
    page_rows = _paginate(rows, page, page_size)

    return DailyFeatureListResponse(
        total=total,
        page=page,
        page_size=page_size,
        rows=[_to_daily_record(row) for row in page_rows.to_dict(orient="records")],
    )


# --- Dashboard AI (read-only synthesis over the cached anomaly and household
# aggregates built above; no new aggregation) -------------------------------

DEFAULT_DASHBOARD_QUESTION = (
    "Summarize the current state of energy anomaly detection on this dashboard: "
    "overall anomaly activity, the recent trend, and which segments or households stand out."
)


@app.post("/api/ai/dashboard/explain", response_model=DashboardExplanationResponse)
def dashboard_explain(
    request: DashboardExplanationRequest = DashboardExplanationRequest(),
) -> DashboardExplanationResponse:
    top_households_df = _anomaly_cache["household_rollup_df"].sort_values(
        "anomaly_count", ascending=False
    )
    context = build_dashboard_context(
        summary=get_summary(),
        monthly_trend_rows=[r.model_dump(mode="json") for r in _anomaly_cache["monthly_trend"].rows],
        segment_summary=_anomaly_cache["segments"].model_dump(mode="json"),
        top_high_anomaly_households=[
            _to_high_anomaly_household_record(row).model_dump(mode="json")
            for row in top_households_df.head(TOP_HIGH_ANOMALY_HOUSEHOLDS).to_dict(orient="records")
        ],
        household_dataset_summary=_household_cache["summary"].model_dump(mode="json"),
    )

    question = request.question or DEFAULT_DASHBOARD_QUESTION
    user_prompt = f"Context:\n{json.dumps(context)}\n\nQuestion: {question}"

    try:
        analysis = complete(DASHBOARD_SYSTEM_PROMPT, user_prompt)
    except LlmConfigurationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except LlmTimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except (LlmRequestError, LlmResponseError) as e:
        raise HTTPException(status_code=502, detail=str(e))

    return DashboardExplanationResponse(analysis=analysis)
