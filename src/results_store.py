"""Read-only data-access layer over the pipeline's Parquet output
(results/anomaly_results.parquet). This is the only module a future API
should import to answer dashboard queries -- it never re-reads the Excel
source, re-derives features, or re-scores anomalies.

The Parquet file is written as a single row group (see pipeline.py /
save_results), so Parquet-level predicate pushdown (filters= on
pd.read_parquet) cannot skip any I/O -- it still reads every column value
before filtering, once per call. Loading the file once into memory and
filtering with pandas is measured to be both simpler and faster for
repeated queries (see module docstring in the accompanying report), so
that is the strategy used here: the DataFrame is read once per process
and reused for every query.

Run directly to print representative query timings against the local
results file:

    python -m src.results_store
"""

from pathlib import Path
from threading import Lock
from time import perf_counter

import pandas as pd

RESULTS_PATH = Path(__file__).resolve().parent.parent / "results" / "anomaly_results.parquet"

REQUIRED_RESULT_COLUMNS = [
    "LCLid", "day", "energy_sum", "expected_consumption", "deviation",
    "statistical_score", "statistical_evidence", "if_score", "if_evidence",
    "hybrid_score", "anomaly_status", "anomaly_type", "confidence",
    "is_complete_day", "eligibility_status",
]

# Low-cardinality columns stored as pandas `category` instead of `object`.
# Measured effect on this dataset (1,048,575 rows): 291 MB -> 79 MB resident
# (deep memory_usage), with no change in query results -- category dtype
# compares and groups identically to the plain strings it replaces.
_CATEGORICAL_COLUMNS = ["LCLid", "anomaly_status", "anomaly_type", "confidence", "eligibility_status"]

_ANOMALY_SORT_COLUMNS = {"hybrid_score", "statistical_score", "if_score", "deviation", "day"}

_cache: pd.DataFrame | None = None
_cache_lock = Lock()


def load_results(path: Path = RESULTS_PATH) -> pd.DataFrame:
    """Return the full results table, loading and caching it in memory on
    first call. Every later call (from any query function below) reuses
    the same in-memory DataFrame instead of re-reading the Parquet file.
    """
    global _cache
    if _cache is not None:
        return _cache

    with _cache_lock:
        if _cache is not None:
            return _cache

        if not path.exists():
            raise FileNotFoundError(
                f"Results file not found at {path}. Generate it first by running "
                "the offline pipeline: `python -m src.pipeline`."
            )

        df = pd.read_parquet(path, engine="pyarrow")

        missing = [c for c in REQUIRED_RESULT_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(
                f"Results file at {path} is missing required columns: {missing}. "
                "It was likely produced by an older version of the pipeline -- regenerate it "
                "with `python -m src.pipeline`."
            )

        for col in _CATEGORICAL_COLUMNS:
            df[col] = df[col].astype("category")

        _cache = df
        return _cache


def get_summary() -> dict:
    """Overall dashboard summary: totals, eligibility, and anomaly counts."""
    df = load_results()
    eligible = df["eligibility_status"] == "eligible"
    anomalies = df["anomaly_status"] == "Anomaly"

    eligible_count = int(eligible.sum())
    anomaly_count = int(anomalies.sum())

    return {
        "total_meters": int(df["LCLid"].nunique()),
        "total_records": len(df),
        "eligible_records": eligible_count,
        "anomaly_count": anomaly_count,
        "anomaly_rate_pct": (anomaly_count / eligible_count * 100) if eligible_count else 0.0,
        "spike_count": int((df["anomaly_type"] == "Spike").sum()),
        "drop_count": int((df["anomaly_type"] == "Drop").sum()),
    }


def list_anomalies(
    meter: str | None = None,
    anomaly_type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort_by: str = "hybrid_score",
    ascending: bool = False,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Filtered, sorted, paginated anomaly rows for the dashboard's anomaly list.

    Only rows with anomaly_status == "Anomaly" are considered -- this endpoint
    is specifically the anomaly list, not the full result set (use
    get_meter_history for a meter's full timeline including normal days).
    """
    if sort_by not in _ANOMALY_SORT_COLUMNS:
        raise ValueError(f"sort_by must be one of {sorted(_ANOMALY_SORT_COLUMNS)}, got {sort_by!r}")
    if page < 1 or page_size < 1:
        raise ValueError("page and page_size must be >= 1")

    df = load_results()
    rows = df[df["anomaly_status"] == "Anomaly"]

    if meter is not None:
        rows = rows[rows["LCLid"] == meter]
    if anomaly_type is not None:
        rows = rows[rows["anomaly_type"] == anomaly_type]
    if start_date is not None:
        rows = rows[rows["day"] >= pd.Timestamp(start_date)]
    if end_date is not None:
        rows = rows[rows["day"] <= pd.Timestamp(end_date)]

    total = len(rows)
    rows = rows.sort_values(sort_by, ascending=ascending)

    start = (page - 1) * page_size
    page_rows = rows.iloc[start : start + page_size]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "rows": page_rows.to_dict(orient="records"),
    }


def get_meter_history(meter: str) -> list[dict]:
    """One meter's full daily history: consumption, baseline, and anomaly
    status/type/score for every recorded day, sorted chronologically.
    """
    df = load_results()
    rows = df[df["LCLid"] == meter].sort_values("day")
    if rows.empty:
        raise ValueError(f"No records found for meter {meter!r}.")
    return rows.to_dict(orient="records")


def get_anomaly_detail(meter: str, day: str) -> dict:
    """Full detail for a single (meter, day) record: actual vs. expected
    consumption, deviation, both detectors' scores, and the final decision.
    """
    df = load_results()
    match = df[(df["LCLid"] == meter) & (df["day"] == pd.Timestamp(day))]
    if match.empty:
        raise ValueError(f"No record found for meter {meter!r} on day {day!r}.")
    return match.iloc[0].to_dict()


def _print_timing_report() -> None:
    t0 = perf_counter()
    load_results()
    print(f"Cold load (read Parquet + categorize):  {perf_counter() - t0:.4f}s")

    t0 = perf_counter()
    load_results()
    print(f"Warm load (cached, repeat call):         {perf_counter() - t0:.6f}s")

    df = load_results()
    sample_meter = df["LCLid"].iloc[0]
    sample_day = df.loc[df["LCLid"] == sample_meter, "day"].iloc[0].date().isoformat()

    t0 = perf_counter()
    summary = get_summary()
    print(f"get_summary():                           {perf_counter() - t0:.4f}s -> {summary}")

    t0 = perf_counter()
    result = list_anomalies(page_size=50)
    print(f"list_anomalies(page_size=50):             {perf_counter() - t0:.4f}s -> total={result['total']}, rows_returned={len(result['rows'])}")

    t0 = perf_counter()
    result = list_anomalies(anomaly_type="Spike", sort_by="hybrid_score", page=1, page_size=50)
    print(f"list_anomalies(type=Spike, sorted, p1):   {perf_counter() - t0:.4f}s -> total={result['total']}")

    t0 = perf_counter()
    history = get_meter_history(sample_meter)
    print(f"get_meter_history({sample_meter!r}):" + " " * max(1, 15 - len(sample_meter)) + f"{perf_counter() - t0:.4f}s -> {len(history)} rows")

    t0 = perf_counter()
    detail = get_anomaly_detail(sample_meter, sample_day)
    print(f"get_anomaly_detail(...):                 {perf_counter() - t0:.6f}s -> keys={list(detail.keys())}")

    print(f"\nCached DataFrame memory (deep): {df.memory_usage(deep=True).sum() / 1_048_576:.1f} MB")


if __name__ == "__main__":
    _print_timing_report()
