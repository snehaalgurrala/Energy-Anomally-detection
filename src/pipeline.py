"""End-to-end anomaly detection pipeline: orchestration only.

    Dataset -> data_validation.load_dataset
            -> feature_engineering.build_features
            -> statistical_detector.score_statistical_anomalies
            -> isolation_forest_detector.score_isolation_forest_anomalies
            -> hybrid_detector.score_hybrid_anomalies
            -> results/anomaly_results.parquet

This module contains no detection logic of its own -- every formula,
threshold, and model lives in the module that owns it and is reused
unchanged. The dataset is loaded once and the same feature table is passed
to every detector, so no stage re-reads or re-derives what an earlier stage
already computed.

Run directly to execute the full pipeline against the local dataset, save
results, and print a validation + performance report:

    python -m src.pipeline
"""

import sys
import tracemalloc
from pathlib import Path
from time import perf_counter

# Sibling modules use bare imports (e.g. `from data_validation import ...`)
# so they can also be run standalone (`python src/statistical_detector.py`).
# Adding this file's own directory to sys.path lets pipeline.py reuse them
# unchanged via the same bare-import style, whether invoked as a script or
# as `python -m src.pipeline` (where the repo root, not src/, is on sys.path).
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd

from data_validation import DATA_PATH, load_dataset
from feature_engineering import build_features
from hybrid_detector import score_hybrid_anomalies
from isolation_forest_detector import score_isolation_forest_anomalies
from statistical_detector import score_statistical_anomalies

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"
RESULTS_PATH = RESULTS_DIR / "anomaly_results.parquet"

# The full set of columns the hybrid detector already produces -- this is
# what a future API/dashboard reads. Declared here (not just implied by
# hybrid_detector's return value) so a change to that module's output shape
# is caught by validate_pipeline_output rather than discovered downstream.
REQUIRED_RESULT_COLUMNS = [
    "LCLid", "day", "energy_sum", "expected_consumption", "deviation",
    "statistical_score", "statistical_evidence", "if_score", "if_evidence",
    "hybrid_score", "anomaly_status", "anomaly_type", "confidence",
    "is_complete_day", "eligibility_status",
]


def run_pipeline(data_path: Path = DATA_PATH) -> dict:
    """Run every stage once against the same in-memory feature table and
    return each stage's output plus per-stage timings, in seconds.
    """
    timings = {}

    t0 = perf_counter()
    df = load_dataset(data_path)
    timings["load_data"] = perf_counter() - t0

    t0 = perf_counter()
    features = build_features(df)
    timings["feature_engineering"] = perf_counter() - t0

    t0 = perf_counter()
    stat_result = score_statistical_anomalies(features)
    timings["statistical_detector"] = perf_counter() - t0

    t0 = perf_counter()
    if_result = score_isolation_forest_anomalies(features)
    timings["isolation_forest_detector"] = perf_counter() - t0

    t0 = perf_counter()
    result = score_hybrid_anomalies(features, stat_result, if_result)
    timings["hybrid_detector"] = perf_counter() - t0

    return {
        "source": df,
        "features": features,
        "stat_result": stat_result,
        "if_result": if_result,
        "result": result,
        "timings": timings,
    }


def save_results(result: pd.DataFrame, path: Path = RESULTS_PATH) -> None:
    """Persist the final anomaly-results table as Parquet: a compact
    columnar format that reads/writes ~1M rows quickly and (unlike CSV)
    preserves dtypes -- no database, no modification of the source dataset.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    result.to_parquet(path, engine="pyarrow", index=False)


def validate_pipeline_output(run: dict) -> dict:
    report = {}

    result = run["result"]
    eligible = result["eligibility_status"] == "eligible"
    anomalies = result["anomaly_status"] == "Anomaly"

    report["source_row_count"] = len(run["source"])
    report["feature_row_count"] = len(run["features"])
    report["eligible_row_count"] = int(eligible.sum())
    report["final_result_row_count"] = len(result)

    report["anomaly_count"] = int(anomalies.sum())
    report["spike_count"] = int((result["anomaly_type"] == "Spike").sum())
    report["drop_count"] = int((result["anomaly_type"] == "Drop").sum())
    report["normal_count"] = int((result["anomaly_status"] == "Normal").sum())
    report["anomaly_rate_pct"] = float(report["anomaly_count"] / report["eligible_row_count"] * 100)

    report["duplicate_key_count"] = int(result.duplicated(subset=["LCLid", "day"]).sum())
    report["missing_required_columns"] = [c for c in REQUIRED_RESULT_COLUMNS if c not in result.columns]

    return report


def check_determinism(data_path: Path = DATA_PATH) -> tuple[bool, float]:
    """Run the full pipeline twice from disk and confirm the two final
    result tables are equivalent (random_state=42 is fixed throughout, so
    this is expected to hold exactly). Returns (is_deterministic, seconds
    for the second run).
    """
    first = run_pipeline(data_path)["result"].reset_index(drop=True)

    t0 = perf_counter()
    second = run_pipeline(data_path)["result"].reset_index(drop=True)
    second_run_seconds = perf_counter() - t0

    return first.equals(second), second_run_seconds


def print_report(run: dict, report: dict, save_seconds: float, peak_memory_mb: float,
                  deterministic: bool, determinism_seconds: float) -> None:
    print("=" * 70)
    print("ANOMALY DETECTION PIPELINE -- RUN REPORT")
    print("=" * 70)

    print(f"\nSource row count:        {report['source_row_count']}")
    print(f"Feature row count:       {report['feature_row_count']}")
    print(f"Eligible row count:      {report['eligible_row_count']}")
    print(f"Final result row count:  {report['final_result_row_count']}")

    print(f"\nAnomaly count: {report['anomaly_count']} ({report['anomaly_rate_pct']:.3f}% of eligible)")
    print(f"  Spike:  {report['spike_count']}")
    print(f"  Drop:   {report['drop_count']}")
    print(f"Normal count: {report['normal_count']}")

    print(f"\nDuplicate (LCLid, day) keys: {report['duplicate_key_count']}")
    print(f"Missing required result columns: {report['missing_required_columns']}")

    print("\nStage timings (seconds):")
    for stage, seconds in run["timings"].items():
        print(f"  {stage}: {seconds:.2f}")
    total = sum(run["timings"].values())
    print(f"  TOTAL (load + features + all 3 detectors): {total:.2f}")
    print(f"  save_results (parquet write): {save_seconds:.2f}")

    print(f"\nPeak traced memory during run: {peak_memory_mb:.1f} MB")

    print(f"\nDeterminism check (full pipeline run twice): {'PASS' if deterministic else 'FAIL'}")
    print(f"  Second run time: {determinism_seconds:.2f}s")

    print(f"\nResults saved to: {RESULTS_PATH}")
    print("=" * 70)


if __name__ == "__main__":
    tracemalloc.start()

    run = run_pipeline()

    t0 = perf_counter()
    save_results(run["result"])
    save_seconds = perf_counter() - t0

    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    report = validate_pipeline_output(run)
    deterministic, determinism_seconds = check_determinism()

    print_report(run, report, save_seconds, peak_bytes / 1_048_576, deterministic, determinism_seconds)
