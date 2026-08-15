"""Cross-dataset segmentation: joins the anomaly-detection results
(src/results_store.py) with household metadata (src/household_consumption.py)
by LCLid, to analyze anomaly activity by ACORN group / tariff.

This is the only module that joins these two datasets -- results_store.py
and the household_* modules stay independent of each other, per each
module's own single-responsibility docstring. Metadata comes from the full
data/informations_households.csv (via load_households()), NOT the
50-household block_0.csv-derived tables built in household_features.py --
those don't cover the anomaly-scored meter population (1,637 meters; zero
overlap with block_0's 50).

Read-only: no model/detector logic, nothing written to disk.
"""

from pathlib import Path
from sys import path as sys_path

import pandas as pd

# Sibling modules under src/ use bare imports so they can also be run
# standalone -- same approach as src/pipeline.py and src/api.py.
sys_path.insert(0, str(Path(__file__).resolve().parent))

from household_consumption import load_households  # noqa: E402
from results_store import load_results  # noqa: E402

SEGMENT_COLUMNS = ("Acorn_grouped", "stdorToU")


def build_anomaly_segment_summary(segment_col: str) -> pd.DataFrame:
    """Anomaly counts/rate grouped by a household metadata column.

    anomaly_rate_pct uses the same eligible-row denominator as
    get_summary()/get_high_anomaly_households(), just partitioned by segment
    instead of by month or by meter.
    """
    if segment_col not in SEGMENT_COLUMNS:
        raise ValueError(f"segment_col must be one of {SEGMENT_COLUMNS}, got {segment_col!r}")

    results = load_results()
    households = load_households()[["LCLid", segment_col]].dropna(subset=[segment_col])
    joined = results.merge(households, on="LCLid", how="inner")

    household_count = joined.groupby(segment_col, observed=True)["LCLid"].nunique()
    eligible = joined[joined["eligibility_status"] == "eligible"]
    anomalies = joined[joined["anomaly_status"] == "Anomaly"]

    summary = pd.DataFrame({
        "household_count": household_count,
        "eligible_count": eligible.groupby(segment_col, observed=True).size(),
        "anomaly_count": anomalies.groupby(segment_col, observed=True).size(),
        "spike_count": anomalies[anomalies["anomaly_type"] == "Spike"].groupby(segment_col, observed=True).size(),
        "drop_count": anomalies[anomalies["anomaly_type"] == "Drop"].groupby(segment_col, observed=True).size(),
    }).fillna(0).astype(int)

    summary["anomaly_rate_pct"] = summary["anomaly_count"] / summary["eligible_count"] * 100
    return summary.reset_index().rename(columns={segment_col: "segment"})
