"""Meter-aware Isolation Forest anomaly detector, built as a second,
unsupervised signal on top of the same feature table used by
statistical_detector.py. No loading, feature, eligibility, or
statistical-score logic is re-implemented here -- eligibility reuses
statistical_detector._eligibility_status directly, refined below.

Run directly to score the local dataset and print a validation report
(including an analysis-only comparison against the statistical detector):

    python src/isolation_forest_detector.py

Feature selection -- round 1 (absolute units) and why it was rejected
------------------------------------------------------------------------
The first version of this module used energy_sum, deviation_from_rolling_
median, rolling_7d_median, and rolling_7d_mad directly (all in raw kWh
units). That model had a ~2.86% anomaly rate in the highest-consumption
meter tertile vs. ~0.06-0.07% in the lower two tertiles (a ~45x skew),
and if_score correlated 0.52 with log(meter's median energy_sum). Testing
confirmed this was not caused by including energy_sum specifically --
dropping it, or even dropping rolling_7d_median too (features = deviation
+ mad only), left essentially the same skew. The actual cause: a high-
consumption meter's *relative* deviation from its own baseline is no
larger than a low-consumption meter's (median |deviation| /
rolling_7d_median is ~13-14% in every tertile), but its *absolute*
deviation is mechanically larger in kWh, and Isolation Forest isolates
points by rarity in raw feature space -- so raw-unit features made this
a high-consumption-meter detector, not a meter-relative one.

Feature selection -- round 2 (relative-to-baseline, current)
-----------------------------------------------------------------
Two ratios, built from columns feature_engineering.py already computes
(no new rolling/statistical logic):

  * relative_deviation = deviation_from_rolling_median / rolling_7d_median
    -- today's deviation as a fraction of the meter's own baseline level.
  * relative_mad = rolling_7d_mad / rolling_7d_median -- the meter's own
    recent coefficient of variation (how volatile it normally is,
    scale-free).

These are deliberately NOT the statistical detector's robust_score
(deviation / MAD, i.e. normalized by variability). relative_deviation
normalizes by baseline *level* instead, and relative_mad is supplied as
a second, separate axis rather than folded into one ratio -- Isolation
Forest's own tree splits learn the interaction (e.g. "large relative
deviation and normally low relative variability") rather than this
module hand-computing a MAD-normalized score. This is a different
statistic from robust_score, not a re-implementation of it.

Tested against the round-1 (absolute) set, pct_change_1d/pct_change_7d
used directly, and a variant adding day_of_week/is_weekend:
  * Tertile skew: round-1 was 2.86% (high) vs. 0.06% (low), a ~45x ratio
    with high-consumption meters over-represented. Round 2 is 0.76%
    (high) vs. 1.47% (low) -- a ~2x ratio, and the direction flips to a
    mild *low*-consumption tilt instead of high. This residual is real
    and reported, not forced to exactly 1x (no tertile equalization was
    applied): a small absolute swing in a near-zero-baseline meter
    produces a large relative_deviation, which is a different, far more
    defensible source of sensitivity than "this meter uses more power."
  * Scale correlation: if_score vs. log1p(meter median energy_sum) goes
    from +0.52 (round 1) to -0.08 (round 2) -- effectively decorrelated
    from consumption level.
  * Diversity vs. statistical detector: round 1 overlapped on only 266
    rows (Jaccard ~1.3%); round 2 overlaps on 3,239 (Jaccard ~18.6%) --
    still mostly disjoint (68% of round-2's flags are not flagged by the
    statistical detector), so this remains a genuinely different signal,
    not a duplicate, while now correlating more sensibly with it
    (score-vs-|robust_score| correlation 0.073 -> 0.162).
  * pct_change_1d/7d directly, as an alternative "already available
    relative feature": similar bias reduction to round 2, but these
    divide by a single lag day (previous_day_energy_sum / the value 7
    days back) rather than a 7-day median, which is exactly the
    denominator statistical_detector.py already documents as unstable
    (outliers past 55,000%). relative_deviation's median-based
    denominator is a materially more robust estimator of "typical
    baseline" than a single day's reading, so this was rejected.
  * Adding day_of_week/is_weekend to round 2: correlation of these
    calendar fields with relative_deviation/relative_mad is <=0.005
    (no linear relationship), and adding them did not further reduce
    tertile skew and *reduced* overlap with the statistical detector
    (3,239 -> 1,663 shared flags). Rejected -- no evidence of benefit.

Decision: (A) meter-relative features are demonstrably better than the
absolute set and are adopted as the feature set below, not layered on
top of it as a second model or fallback.

Undefined relative baseline (near-zero rolling_7d_median)
--------------------------------------------------------------
relative_deviation and relative_mad divide by rolling_7d_median, which
is exactly zero for 3,587 of 1,024,971 otherwise-eligible rows (0.35%)
-- meters with a completely flat, zero-consumption trailing week (e.g.
a vacant or disconnected meter). For these rows the ratio is
mathematically undefined (0/0 or x/0), not just numerically unstable, so
they are excluded from Isolation Forest eligibility rather than imputed
or clipped -- the same "exclude, don't invent a value" policy
statistical_detector.py applies to its own zero-MAD case, applied here
to a different denominator. This is the one explicit treatment; no
epsilon-padding or fallback value is used.

Eligibility
------------
_if_eligibility_status(features) starts from statistical_detector.
_eligibility_status(features) unchanged (insufficient_history /
gap_in_history / incomplete_day / eligible), then reclassifies eligible
rows with a near-zero rolling_7d_median baseline as
"undefined_relative_baseline" (see above). This is a strict narrowing --
every row eligible for Isolation Forest was already eligible for the
statistical detector.

Model design
-------------
  * contamination=0.01 -- chosen to mirror the statistical detector's own
    ~1% flag rate (DEFAULT_ANOMALY_PERCENTILE=99 there), so the two
    signals are comparable in this analysis-only phase rather than
    sklearn's un-inspected 'auto' default.
  * n_estimators=100 -- the isolation-path-length estimate sklearn's
    default is built around (Liu et al.); with max_samples=256 subsampled
    per tree this already converges on this dataset size (see runtime in
    the validation report) so there is no evidence more trees are needed.
  * max_samples='auto' (min(256, n_rows)) -- left at default deliberately:
    small per-tree subsamples are the mechanism that makes Isolation
    Forest both fast and effective (larger samples increase masking/
    swamping per the original paper), and 1024971 >> 256 so this is what
    keeps scoring ~1M rows fast.
  * random_state=42 -- fixed for a deterministic POC.
  * No feature scaling: each Isolation Forest split picks one feature and
    a random threshold within *that feature's own* observed range, so
    isolation depth is invariant to per-feature linear rescaling -- unlike
    distance-based models, nothing here compares magnitudes *across*
    features. relative_deviation and relative_mad are also already
    unitless and on comparable scales, so there is nothing left to gain
    from scaling even if it were needed for another reason.

Meter-awareness
-----------------
One global model is used, not one per meter (1636 meters). Both features
are per-meter ratios (today vs. that meter's own trailing baseline and
volatility), so a single tree ensemble already sees every row in
meter-relative terms -- the round-1-vs-round-2 comparison above is the
evidence that this is enough to remove the dominant consumption-size
bias, without training thousands of per-meter models.

Output
-------
score_isolation_forest_anomalies returns one row per input (LCLid, day)
row (no rows added or dropped), with the model's raw decision score kept
separate from any eventual hybrid score:

  * if_eligibility_status -- insufficient_history / gap_in_history /
    incomplete_day / undefined_relative_baseline / eligible.
  * if_score -- higher = more anomalous (sign-flipped from sklearn's
    decision_function, where lower/negative means more abnormal, so this
    detector's convention matches |robust_score| from the statistical
    detector: bigger number = more unusual). NaN where ineligible.
  * is_if_anomaly -- False where ineligible.
"""

from time import perf_counter

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from data_validation import load_dataset
from feature_engineering import build_features
from statistical_detector import _eligibility_status, score_statistical_anomalies

IF_FEATURES = ["relative_deviation", "relative_mad"]

# rolling_7d_median is a non-negative kWh value; data resolution is 0.001,
# nine orders of magnitude above this -- same reasoning as
# statistical_detector.ZERO_MAD_EPS, applied to this module's denominator.
RATIO_EPS = 1e-9

N_ESTIMATORS = 100
CONTAMINATION = 0.01
RANDOM_STATE = 42


def _if_eligibility_status(features: pd.DataFrame) -> pd.Series:
    """Statistical-detector eligibility, narrowed by one additional rule:
    rows with a zero (flat, zero-consumption) trailing-week baseline can't
    support a relative-to-baseline ratio and are reclassified out of
    "eligible" rather than scored with an imputed or clipped denominator.
    """
    status = _eligibility_status(features)
    undefined_baseline = (status == "eligible") & (features["rolling_7d_median"].abs() < RATIO_EPS)
    return status.mask(undefined_baseline, "undefined_relative_baseline")


def score_isolation_forest_anomalies(features: pd.DataFrame) -> pd.DataFrame:
    """Score every (LCLid, day) row with a single global Isolation Forest
    trained on meter-relative behavioral features. One output row per input
    row -- no rows added or dropped.
    """
    eligibility_status = _if_eligibility_status(features)
    eligible_mask = eligibility_status == "eligible"

    eligible_features = features.loc[eligible_mask]
    X = pd.DataFrame(
        {
            "relative_deviation": eligible_features["deviation_from_rolling_median"] / eligible_features["rolling_7d_median"],
            "relative_mad": eligible_features["rolling_7d_mad"] / eligible_features["rolling_7d_median"],
        }
    )

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    predictions = model.fit_predict(X)
    if_score = -model.decision_function(X)  # higher = more anomalous

    result = features[["LCLid", "day"]].copy()
    result["if_eligibility_status"] = eligibility_status
    result["if_score"] = np.nan
    result["is_if_anomaly"] = False
    result.loc[eligible_mask, "if_score"] = if_score
    result.loc[eligible_mask, "is_if_anomaly"] = predictions == -1

    result.attrs["contamination"] = CONTAMINATION
    result.attrs["n_estimators"] = N_ESTIMATORS
    result.attrs["features"] = IF_FEATURES
    return result


def validate_if_scores(result: pd.DataFrame, features: pd.DataFrame) -> dict:
    report = {}
    n = len(result)

    report["row_count"] = n
    report["features"] = result.attrs["features"]
    report["contamination"] = result.attrs["contamination"]
    report["n_estimators"] = result.attrs["n_estimators"]

    status_counts = result["if_eligibility_status"].value_counts()
    report["eligibility_counts"] = status_counts.to_dict()
    report["eligibility_pct"] = (status_counts / n * 100).to_dict()

    eligible = result.loc[result["if_eligibility_status"] == "eligible"]
    report["eligible_count"] = len(eligible)
    report["training_row_count"] = len(eligible)

    report["score_describe"] = eligible["if_score"].describe().to_dict()
    report["score_percentiles"] = {
        p: float(eligible["if_score"].quantile(p / 100)) for p in [50, 75, 90, 95, 99, 99.5, 99.9]
    }

    report["anomaly_count"] = int(result["is_if_anomaly"].sum())
    report["anomaly_pct_of_eligible"] = float(result["is_if_anomaly"].sum() / len(eligible) * 100)

    joined = eligible.merge(
        features[["LCLid", "day", "energy_sum", "rolling_7d_median", "rolling_7d_mad", "deviation_from_rolling_median"]],
        on=["LCLid", "day"],
    )
    joined["relative_deviation"] = joined["deviation_from_rolling_median"] / joined["rolling_7d_median"]
    joined["relative_mad"] = joined["rolling_7d_mad"] / joined["rolling_7d_median"]

    top_n = 10
    cols = ["LCLid", "day", "energy_sum", "rolling_7d_median", "relative_deviation", "relative_mad", "if_score"]
    report["top_anomalies"] = joined.reindex(joined["if_score"].sort_values(ascending=False).index).head(top_n)[cols]

    # Consumption-tertile breakdown: is the model dominated by high-consumption meters?
    meter_level = joined.groupby("LCLid")["energy_sum"].median()
    tertile = pd.qcut(meter_level, 3, labels=["low", "mid", "high"])
    tertile_summary = joined.assign(consumption_tertile=joined["LCLid"].map(tertile)).groupby(
        "consumption_tertile", observed=True
    ).agg(n_rows=("is_if_anomaly", "size"), n_anomalies=("is_if_anomaly", "sum"))
    tertile_summary["anomaly_pct"] = tertile_summary["n_anomalies"] / tertile_summary["n_rows"] * 100
    report["consumption_tertile_summary"] = tertile_summary

    # Direct scale-bias check: correlation of score / per-meter anomaly rate with
    # meter consumption level (log1p to tame the long right tail of energy_sum).
    report["score_vs_consumption_corr"] = float(joined["if_score"].corr(np.log1p(joined["energy_sum"])))
    per_meter_rate = joined.groupby("LCLid")["is_if_anomaly"].mean()
    per_meter_level = np.log1p(meter_level.reindex(per_meter_rate.index))
    report["anomaly_rate_vs_consumption_corr"] = float(per_meter_rate.corr(per_meter_level))
    report["per_meter_anomaly_rate_describe"] = (per_meter_rate * 100).describe().to_dict()

    meters = sorted(result["LCLid"].unique())
    picks = [meters[0], meters[len(meters) // 2], meters[-1]]
    report["representative_meters"] = {
        meter: {
            "n_rows": int((result["LCLid"] == meter).sum()),
            "eligible_rows": int(
                ((result["LCLid"] == meter) & (result["if_eligibility_status"] == "eligible")).sum()
            ),
            "anomalies": int(((result["LCLid"] == meter) & result["is_if_anomaly"]).sum()),
        }
        for meter in picks
    }

    return report


def compare_with_statistical(if_result: pd.DataFrame, stat_result: pd.DataFrame) -> dict:
    """Analysis-only comparison of the two detectors' flagged rows. Does not
    combine scores -- that is deliberately left to a later hybrid step.
    """
    merged = if_result[["LCLid", "day", "if_score", "is_if_anomaly", "if_eligibility_status"]].merge(
        stat_result[["LCLid", "day", "robust_score", "is_statistical_anomaly", "eligibility_status"]],
        on=["LCLid", "day"],
    )
    both_eligible = merged.loc[
        (merged["if_eligibility_status"] == "eligible") & (merged["eligibility_status"] == "eligible")
    ]

    report = {}
    report["both_eligible_count"] = len(both_eligible)
    report["crosstab"] = pd.crosstab(
        both_eligible["is_if_anomaly"], both_eligible["is_statistical_anomaly"]
    )

    finite = both_eligible.loc[np.isfinite(both_eligible["robust_score"])]
    report["score_correlation"] = float(finite["if_score"].corr(finite["robust_score"].abs()))

    only_if = both_eligible["is_if_anomaly"] & ~both_eligible["is_statistical_anomaly"]
    only_stat = ~both_eligible["is_if_anomaly"] & both_eligible["is_statistical_anomaly"]
    both = both_eligible["is_if_anomaly"] & both_eligible["is_statistical_anomaly"]
    report["only_if_count"] = int(only_if.sum())
    report["only_stat_count"] = int(only_stat.sum())
    report["both_count"] = int(both.sum())
    report["jaccard_pct"] = float(both.sum() / (only_if.sum() + only_stat.sum() + both.sum()) * 100)

    return report


def print_report(report: dict, compare: dict, build_seconds: float) -> None:
    print("=" * 70)
    print("ISOLATION FOREST ANOMALY DETECTOR VALIDATION REPORT")
    print("=" * 70)

    print(f"\nFeatures: {report['features']}")
    print(f"contamination={report['contamination']}, n_estimators={report['n_estimators']}, random_state={RANDOM_STATE}")

    print(f"\nTotal rows: {report['row_count']}")
    print("Eligibility status counts:")
    for status, count in report["eligibility_counts"].items():
        print(f"  {status}: {count} ({report['eligibility_pct'][status]:.2f}%)")

    print(f"\nTraining / eligible rows: {report['training_row_count']}")

    print("\nif_score distribution (eligible rows):")
    for k, v in report["score_describe"].items():
        print(f"  {k}: {v:.4f}")

    print("\nif_score percentiles (eligible rows):")
    for p, v in report["score_percentiles"].items():
        print(f"  {p}: {v:.4f}")

    print(f"\nAnomalies flagged: {report['anomaly_count']} ({report['anomaly_pct_of_eligible']:.2f}% of eligible)")

    print("\nTop 10 if_score observations:")
    print(report["top_anomalies"].to_string(index=False))

    print("\nAnomaly rate by meter consumption tertile (low/mid/high median energy_sum):")
    print(report["consumption_tertile_summary"].to_string())

    print(f"\nCorrelation(if_score, log1p(energy_sum)): {report['score_vs_consumption_corr']:.4f}")
    print(f"Correlation(per-meter anomaly rate, log1p(meter median energy_sum)): {report['anomaly_rate_vs_consumption_corr']:.4f}")

    print("\nPer-meter anomaly-rate distribution (%):")
    for k, v in report["per_meter_anomaly_rate_describe"].items():
        print(f"  {k}: {v:.4f}")

    print("\nRepresentative meters (first / middle / last by LCLid):")
    for meter, info in report["representative_meters"].items():
        print(f"  {meter}: {info}")

    print(f"\nRuntime (build features + fit + score): {build_seconds:.2f}s")

    print("\n" + "-" * 70)
    print("COMPARISON WITH STATISTICAL DETECTOR (analysis only, not combined)")
    print("-" * 70)
    print(f"Rows eligible for both detectors: {compare['both_eligible_count']}")
    print("\nCrosstab (rows, is_if_anomaly x is_statistical_anomaly):")
    print(compare["crosstab"].to_string())
    print(f"\nFlagged by both: {compare['both_count']}")
    print(f"Flagged by Isolation Forest only: {compare['only_if_count']}")
    print(f"Flagged by statistical detector only: {compare['only_stat_count']}")
    print(f"Jaccard overlap: {compare['jaccard_pct']:.2f}%")
    print(f"Correlation(if_score, |robust_score|) on finite-score rows: {compare['score_correlation']:.4f}")
    print("=" * 70)


if __name__ == "__main__":
    df = load_dataset()

    t0 = perf_counter()
    features = build_features(df)
    if_result = score_isolation_forest_anomalies(features)
    build_seconds = perf_counter() - t0

    stat_result = score_statistical_anomalies(features)

    report = validate_if_scores(if_result, features)
    compare = compare_with_statistical(if_result, stat_result)
    print_report(report, compare, build_seconds)
