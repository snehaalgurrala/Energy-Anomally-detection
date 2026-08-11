"""Read-only FastAPI backend for the anomaly-detection dashboard.

This module contains no detection logic and never touches the source
dataset: every route is a thin wrapper around src/results_store.py's
four query functions, which read the already-generated
results/anomaly_results.parquet. The results file is loaded once, at
process startup (see `lifespan` below), and reused by every request.

Run locally from the repo root:

    uvicorn src.api:app --reload
"""

from contextlib import asynccontextmanager
from datetime import date
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.results_store import get_anomaly_detail, get_meter_history, get_summary, list_anomalies, load_results

# Origin of the local Next.js dev server this API is built to serve.
# Update this if the frontend runs on a different host/port.
NEXTJS_DEV_ORIGIN = "http://localhost:3000"

SortColumn = Literal["hybrid_score", "statistical_score", "if_score", "deviation", "day"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_results()  # cold-load the Parquet file once at startup, not on the first request
    yield


app = FastAPI(title="Energy Anomaly Detection API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[NEXTJS_DEV_ORIGIN],
    allow_methods=["GET"],
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


def _to_record(row: dict) -> AnomalyRecord:
    """Convert one results_store record dict into an AnomalyRecord.

    pandas represents both missing values and the `day` timestamp in ways
    Pydantic won't accept as-is (NaN for missing strings/floats, a
    Timestamp instead of a date), so both are normalized here -- this is
    response serialization, not result-store logic.
    """
    clean = {k: (None if pd.isna(v) else v) for k, v in row.items()}
    clean["day"] = row["day"].date()
    return AnomalyRecord(**clean)


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
