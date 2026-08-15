"""Builds the structured context for the Energy AI Analyst's anomaly
explanation feature, and owns the fixed system prompt that goes with it.

Every value in the context comes from an existing project function -- no new
aggregation, no new anomaly metric, no re-derivation of anything the pipeline
or the API layer already computes:

  * results_store.get_anomaly_detail / get_meter_history   -- the anomaly
    itself and its meter's history (results/anomaly_results.parquet).
  * household_consumption.load_households                  -- tariff/ACORN
    metadata for the meter (data/informations_households.csv).
  * anomaly_segmentation.build_anomaly_segment_summary      -- how the
    meter's segments compare dataset-wide.

household_features.py is deliberately not used here: it's built from
block_0.csv's 50-household sample, which has zero overlap with the
anomaly-scored meter population (see anomaly_segmentation.py's module
docstring) -- a meter selected on the Anomalies pages will never appear in
that table.
"""

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

# Sibling modules under src/ use bare imports so they can also be run
# standalone -- same approach as src/pipeline.py and src/api.py. This file
# lives one directory deeper (src/ai/), so it walks up two parents to reach
# src/ instead of one.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from anomaly_segmentation import build_anomaly_segment_summary  # noqa: E402
from household_consumption import load_households  # noqa: E402
from results_store import get_anomaly_detail, get_meter_history  # noqa: E402

# Days of meter history included on each side of the selected anomaly, so
# the analyst can describe "what happened around this anomaly" without being
# handed the meter's entire history.
HISTORY_WINDOW_DAYS = 14

SEGMENT_COLUMNS = ("Acorn_grouped", "stdorToU")

SYSTEM_PROMPT = """You are the Energy AI Analyst, embedded in an energy-consumption anomaly-detection dashboard.

You will be given a JSON context describing one specific flagged anomaly: its detection scores, a window of the same meter's history around it, that household's tariff/ACORN classification, and how its segment compares dataset-wide. This context is the only source of truth you have.

Rules you must follow:
- Use ONLY the facts contained in the supplied context. Never invent numbers, dates, meters, causes, or classifications that are not present in it.
- Do not perform calculations beyond what is already in the context (e.g. do not compute new percentages, rates, or averages).
- Explain the anomaly in clear, plain business language a non-technical dashboard user can follow.
- Clearly distinguish observations (what the data shows) from interpretations (what it might mean). Use phrasing like "consistent with" or "unusual relative to" for interpretations -- never state them as fact.
- Never claim a specific cause -- fraud, equipment failure, customer behavior, or anything else -- as fact unless it is explicitly present in the supplied data. The context given to you never states a cause, so do not assert one.
- If a question cannot be answered from the supplied context, say plainly that the available data does not establish it. Do not guess.
- Stay focused on the selected anomaly. Do not answer questions unrelated to it.
- Keep your response concise: a short paragraph or a few bullet points, useful at a glance on a dashboard.
"""


def _clean_record(record: dict) -> dict:
    """One results_store record dict -> JSON-safe values. pandas Timestamp
    and NaN aren't valid JSON; every other value already is."""
    cleaned = {}
    for key, value in record.items():
        if isinstance(value, pd.Timestamp):
            cleaned[key] = value.date().isoformat()
        elif pd.isna(value):
            cleaned[key] = None
        else:
            cleaned[key] = value
    return cleaned


def build_anomaly_explanation_context(meter: str, day: str) -> dict:
    """Structured, JSON-safe context for one (meter, day) anomaly: the
    anomaly itself, a history window around it, the meter's tariff/ACORN
    metadata, and how its segments compare dataset-wide.

    Raises ValueError (propagated from results_store.get_anomaly_detail) if
    no record exists for (meter, day) -- the same error api.py already
    catches to return 404 for the existing anomaly endpoints.
    """
    anomaly = get_anomaly_detail(meter, day)
    history = get_meter_history(meter)

    selected_day: date = anomaly["day"].date()
    window_start = selected_day - timedelta(days=HISTORY_WINDOW_DAYS)
    window_end = selected_day + timedelta(days=HISTORY_WINDOW_DAYS)
    history_window = [
        record for record in history
        if window_start <= record["day"].date() <= window_end
    ]

    households = load_households()
    household_match = households.loc[households["LCLid"] == meter]
    household_metadata = (
        household_match[["stdorToU", "Acorn", "Acorn_grouped"]].iloc[0].to_dict()
        if not household_match.empty
        else {}
    )

    segment_comparison = {}
    for segment_col in SEGMENT_COLUMNS:
        segment_value = household_metadata.get(segment_col)
        if segment_value is None:
            continue
        segment_summary = build_anomaly_segment_summary(segment_col)
        segment_row = segment_summary.loc[segment_summary["segment"] == segment_value]
        if not segment_row.empty:
            segment_comparison[segment_col] = _clean_record(segment_row.iloc[0].to_dict())

    return {
        "selected_anomaly": _clean_record(anomaly),
        "history_window_days": HISTORY_WINDOW_DAYS,
        "meter_history_around_anomaly": [_clean_record(r) for r in history_window],
        "household_metadata": household_metadata,
        "segment_comparison": segment_comparison,
    }
