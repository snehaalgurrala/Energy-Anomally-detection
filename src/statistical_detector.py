"""Meter-aware statistical anomaly detector built on each meter's own
trailing 7-day median/MAD baseline (rolling_7d_median, rolling_7d_mad,
deviation_from_rolling_median from feature_engineering.py -- no rolling/lag
logic is re-implemented here).

Run directly to score the local dataset and print a validation report:

    python src/statistical_detector.py

Methodology
-----------
Score = modified (robust) z-score = MAD_SCALE * deviation / rolling_7d_mad,
i.e. today's deviation from the meter's own trailing-week median, expressed
in units of that week's own median-absolute-deviation. MAD_SCALE (0.6745)
is the standard factor that makes this comparable in magnitude to a normal
std-dev z-score.

Percentage-change features (pct_change_1d/7d) are deliberately NOT used:
they divide by the previous day's raw value, so a near-zero previous
reading (present in ~0.5% of rows) produces changes of thousands of
percent that are uncorrelated with the real size of the change (see
validation report / conversation notes). The median/MAD score sidesteps
this entirely because it never divides by the consumption level itself,
only by the week's own variability -- a near-zero baseline is not, on its
own, a scoring problem here.

Zero/near-zero MAD ("historical variability is undefined")
------------------------------------------------------------
The dataset's energy_sum is quantized to 3 decimal places (kWh), so the
smallest possible *real* nonzero MAD is 0.001. When every value in a
window is truly identical, np.median()'s float arithmetic occasionally
yields ~1e-15/1e-17 instead of an exact 0.0 -- ZERO_MAD_EPS (1e-9) treats
those as exactly zero; it is far below the data's real resolution, so it
can never mask a genuine measurement.

For rows where MAD is (effectively) zero -- a perfectly flat trailing
week -- dividing is not "fill in a fallback", it is mathematically
undefined, so it is handled explicitly instead of computed:
  * today's value matches that flat baseline -> score = 0.0 (an exact
    match is genuinely "no deviation", not an indeterminate 0/0).
  * today's value differs -> score = signed infinity. This is not an
    arbitrary constant -- it is the true limit of (deviation / MAD) as
    MAD -> 0 for a fixed nonzero numerator. A week with zero historical
    variability gives no unit to measure the change against, so any
    change is unmeasurable-large by construction, and infinity is the
    honest representation of that rather than a made-up large number.

Data-quality policy (incomplete days)
--------------------------------------
Incomplete days (energy_count != 48) are EXCLUDED from scoring, not
down-weighted. The validation report shows this is a systematic bias, not
extra noise: mean deviation_from_rolling_median is -3.04 on incomplete
days vs +0.24 on complete days -- an incomplete day's energy_sum is a
partial-day total, structurally smaller than the full-day baseline it
would be compared against, so scoring it (even at reduced confidence)
would manufacture false low-consumption anomalies. The row is still kept
in the output with is_complete_day=False and
eligibility_status="incomplete_day" so its status remains visible.

Eligibility
------------
`eligibility_status` is evaluated before scoring:
  * "insufficient_history" -- meter is within its first ROLLING_WINDOW
    real records (its timeline has not yet accumulated a 7-day baseline).
  * "gap_in_history" -- meter has enough tenure, but a hole in its
    calendar fell inside the trailing 7-day window, so no baseline could
    be computed for this day.
  * "incomplete_day" -- a baseline exists, but today's own reading is a
    partial day (see above).
  * "eligible" -- baseline and today's reading are both usable; scored.

Threshold
----------
No fixed z-score cutoff (e.g. the textbook 3.5) is hardcoded. See
`recommend_threshold` / the validation report for the empirical
percentile evidence behind the default (99th percentile of |robust_score|
among eligible, finite-score rows).
"""

from time import perf_counter

import numpy as np
import pandas as pd

from data_validation import load_dataset
from feature_engineering import ROLLING_WINDOW, build_features

# Below this, a nonzero rolling_7d_mad can only be float noise around a
# truly-flat window (see module docstring) -- the data's real resolution
# is 0.001, nine orders of magnitude above this epsilon.
ZERO_MAD_EPS = 1e-9

# 0.6745 = Phi^-1(0.75): scales MAD to be comparable to a normal std-dev.
MAD_SCALE = 0.6745

DEFAULT_ANOMALY_PERCENTILE = 99.0


def _eligibility_status(features: pd.DataFrame) -> pd.Series:
    """One label per row explaining whether/why it can be scored. Baseline
    availability gates completeness: a day with no baseline can't be scored
    regardless of its own completeness, so missing-baseline reasons take
    priority over incomplete_day.
    """
    has_baseline = features["rolling_7d_median"].notna() & features["rolling_7d_mad"].notna()
    is_early_record = features.groupby("LCLid").cumcount() < ROLLING_WINDOW

    return pd.Series(
        np.select(
            [~has_baseline & is_early_record, ~has_baseline, ~features["is_complete_day"]],
            ["insufficient_history", "gap_in_history", "incomplete_day"],
            default="eligible",
        ),
        index=features.index,
    )


def _robust_score(features: pd.DataFrame, eligible: pd.Series) -> pd.Series:
    """Modified z-score of today's deviation in units of the meter's own
    trailing-week MAD. NaN where ineligible; see module docstring for the
    zero-MAD treatment.
    """
    deviation = features["deviation_from_rolling_median"]
    mad = features["rolling_7d_mad"]

    score = pd.Series(np.nan, index=features.index)

    zero_mad = eligible & (mad < ZERO_MAD_EPS)
    matched_flat_baseline = zero_mad & (deviation.abs() < ZERO_MAD_EPS)
    broke_flat_baseline = zero_mad & ~matched_flat_baseline
    measurable = eligible & (mad >= ZERO_MAD_EPS)

    score[matched_flat_baseline] = 0.0
    score[broke_flat_baseline] = np.sign(deviation[broke_flat_baseline]) * np.inf
    score[measurable] = MAD_SCALE * deviation[measurable] / mad[measurable]

    return score


def recommend_threshold(
    robust_score: pd.Series, eligibility_status: pd.Series, percentile: float = DEFAULT_ANOMALY_PERCENTILE
) -> float:
    """Percentile-based cutoff on |robust_score|, computed only from
    eligible, finite-score rows (infinite scores are excluded from the
    percentile computation but always count as anomalies -- see
    score_statistical_anomalies).
    """
    eligible_scores = robust_score[(eligibility_status == "eligible") & np.isfinite(robust_score)]
    return float(np.percentile(eligible_scores.abs(), percentile))


def score_statistical_anomalies(
    features: pd.DataFrame, anomaly_percentile: float = DEFAULT_ANOMALY_PERCENTILE
) -> pd.DataFrame:
    """Score every (LCLid, day) row for anomalous consumption relative to
    that meter's own trailing-7-day median/MAD baseline. One output row per
    input row -- no rows added or dropped.
    """
    eligibility_status = _eligibility_status(features)
    eligible = eligibility_status == "eligible"

    robust_score = _robust_score(features, eligible)
    threshold = recommend_threshold(robust_score, eligibility_status, anomaly_percentile)
    is_statistical_anomaly = eligible & (robust_score.abs() >= threshold)

    result = features[
        ["LCLid", "day", "energy_sum", "is_complete_day", "rolling_7d_median", "rolling_7d_mad", "deviation_from_rolling_median"]
    ].copy()
    result["eligibility_status"] = eligibility_status
    result["robust_score"] = robust_score
    result["is_statistical_anomaly"] = is_statistical_anomaly
    result.attrs["anomaly_threshold"] = threshold
    result.attrs["anomaly_percentile"] = anomaly_percentile
    return result


def validate_scores(result: pd.DataFrame) -> dict:
    report = {}
    n = len(result)

    report["row_count"] = n
    report["threshold"] = result.attrs["anomaly_threshold"]
    report["percentile"] = result.attrs["anomaly_percentile"]

    status_counts = result["eligibility_status"].value_counts()
    report["eligibility_counts"] = status_counts.to_dict()
    report["eligibility_pct"] = (status_counts / n * 100).to_dict()

    eligible = result.loc[result["eligibility_status"] == "eligible"]
    report["eligible_count"] = len(eligible)

    finite_scores = eligible.loc[np.isfinite(eligible["robust_score"]), "robust_score"]
    report["finite_score_describe"] = finite_scores.describe().to_dict()
    report["finite_score_abs_percentiles"] = {
        p: float(finite_scores.abs().quantile(p / 100)) for p in [50, 75, 90, 95, 99, 99.5, 99.9]
    }

    report["zero_mad_matched_count"] = int((eligible["robust_score"] == 0.0).sum())
    report["zero_mad_broke_count"] = int(np.isinf(eligible["robust_score"]).sum())

    report["anomaly_count"] = int(result["is_statistical_anomaly"].sum())
    report["anomaly_pct_of_eligible"] = float(
        result["is_statistical_anomaly"].sum() / len(eligible) * 100
    )

    top_n = 10
    cols = ["LCLid", "day", "energy_sum", "rolling_7d_median", "rolling_7d_mad", "robust_score"]
    report["top_anomalies"] = (
        result.reindex(result["robust_score"].abs().sort_values(ascending=False).index).head(top_n)[cols]
    )
    finite = result.loc[np.isfinite(result["robust_score"])]
    report["top_finite_anomalies"] = (
        finite.reindex(finite["robust_score"].abs().sort_values(ascending=False).index).head(top_n)[cols]
    )

    meters = sorted(result["LCLid"].unique())
    picks = [meters[0], meters[len(meters) // 2], meters[-1]]
    report["representative_meters"] = {
        meter: {
            "n_rows": int((result["LCLid"] == meter).sum()),
            "eligible_rows": int(
                ((result["LCLid"] == meter) & (result["eligibility_status"] == "eligible")).sum()
            ),
            "anomalies": int(((result["LCLid"] == meter) & result["is_statistical_anomaly"]).sum()),
        }
        for meter in picks
    }

    return report


def print_report(report: dict, build_seconds: float) -> None:
    print("=" * 70)
    print("STATISTICAL ANOMALY DETECTOR VALIDATION REPORT")
    print("=" * 70)

    print(f"\nTotal rows: {report['row_count']}")
    print(f"Anomaly threshold (|robust_score| >=): {report['threshold']:.2f} (percentile {report['percentile']})")

    print("\nEligibility status counts:")
    for status, count in report["eligibility_counts"].items():
        print(f"  {status}: {count} ({report['eligibility_pct'][status]:.2f}%)")

    print(f"\nEligible (scored) rows: {report['eligible_count']}")
    print(f"Zero-MAD, matched flat baseline (score = 0.0): {report['zero_mad_matched_count']}")
    print(f"Zero-MAD, broke flat baseline (score = +/-inf): {report['zero_mad_broke_count']}")

    print("\nFinite robust_score distribution (eligible rows, excludes +/-inf):")
    for k, v in report["finite_score_describe"].items():
        print(f"  {k}: {v:.4f}")

    print("\n|robust_score| percentiles (finite, eligible rows):")
    for p, v in report["finite_score_abs_percentiles"].items():
        print(f"  {p}: {v:.2f}")

    print(f"\nStatistical anomalies flagged: {report['anomaly_count']} ({report['anomaly_pct_of_eligible']:.2f}% of eligible)")

    print("\nTop 10 |robust_score| observations (including +/-inf, unordered among ties):")
    print(report["top_anomalies"].to_string(index=False))

    print("\nTop 10 finite |robust_score| observations:")
    print(report["top_finite_anomalies"].to_string(index=False))

    print("\nRepresentative meters (first / middle / last by LCLid):")
    for meter, info in report["representative_meters"].items():
        print(f"  {meter}: {info}")

    print(f"\nBuild+score time: {build_seconds:.2f}s")
    print("=" * 70)


if __name__ == "__main__":
    df = load_dataset()

    t0 = perf_counter()
    features = build_features(df)
    result = score_statistical_anomalies(features)
    build_seconds = perf_counter() - t0

    report = validate_scores(result)
    print_report(report, build_seconds)
