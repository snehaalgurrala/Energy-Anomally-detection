"""Final hybrid anomaly detector, combining statistical_detector.py's
robust z-score and isolation_forest_detector.py's meter-relative
Isolation Forest into one meter-aware anomaly score. No loading,
feature, eligibility, or scoring logic is re-implemented -- both
detectors' outputs are reused as-is.

Run directly to score the local dataset and print a validation report:

    python src/hybrid_detector.py

Score normalization
---------------------
statistical_detector's robust_score and isolation_forest_detector's
if_score are not on comparable scales: robust_score is an unbounded,
heavy-tailed z-score-like quantity that can be +/-inf (0.085% of
statistically-eligible rows -- see statistical_detector.py), while
if_score is a bounded, roughly-normal-shaped quantity from
IsolationForest.decision_function (see isolation_forest_detector.py's
validation report: min -0.35, max 0.13). Averaging them directly would
let robust_score's scale (and its infinities) dominate.

Both are converted to a percentile rank in (0, 1] via
Series.rank(pct=True), computed over the hybrid-eligible population
(see Eligibility below) -- the same population the hybrid score is
computed for, so both normalized signals are uniform-on-(0,1] over an
identical row set and are directly comparable. This is a data-derived
choice, not an arbitrary min/max rescale: it requires no assumption
about either score's shape (both are heavy-tailed / skewed, which is
exactly when rank normalization is preferred over z-scoring or min-max),
and it handles robust_score's +/-inf values for free -- rank() treats
+/-inf as the largest/smallest values, no special-casing needed, no
clipping applied.

statistical_evidence = rank_pct(|robust_score|) -- magnitude of
deviation from the meter's own baseline, direction discarded (direction
is recovered separately for anomaly_type, see below).
if_evidence = rank_pct(if_score) -- if_score is already a pure
"how isolated is this point" magnitude (see isolation_forest_detector.py
docstring), so no abs() is needed.

Both evidence values mean the same thing on the same 0-1 scale: "this
row's score is higher than evidence*100% of hybrid-eligible rows under
that detector."

Combining the signals
------------------------
hybrid_score = 0.5 * statistical_evidence + 0.5 * if_evidence.

Equal weighting is kept: Spearman-style correlation between the two
evidence columns is 0.44 (moderate positive agreement, well short of the
near-1.0 that would suggest one signal is redundant, and well short of
~0 that would suggest one is noise) -- not a strong justification to
move off the interpretable 0.5/0.5 starting point.

Anomaly decision (threshold)
--------------------------------
HYBRID_ANOMALY_THRESHOLD = 0.99, applied directly to hybrid_score (an
absolute cutoff on its own 0-1 scale, not a further percentile-of-
percentile). This was chosen by inspecting, at a grid of candidate
cutoffs, how many hybrid-flagged rows were flagged by *neither*
individual detector's own boolean decision (is_statistical_anomaly,
is_if_anomaly):

    threshold  flagged   flagged-by-neither-detector
    0.975      10624     2114  (19.9%)
    0.980       8740      1186 (13.6%)
    0.985       6791       377  (5.6%)
    0.988       5417        81  (1.5%)
    0.990       4489         0  (0.0%)
    0.992       3569         0  (0.0%)

0.99 is exactly the elbow where that count drops to, and stays at, zero:
below it, a growing share of "anomalies" would be rows neither detector
independently considered unusual (the hybrid manufacturing new findings
purely from two moderately-elevated-but-individually-unremarkable
scores); at or above it, every hybrid anomaly is corroborated by at
least one detector's own independent decision. This also has a direct
algebraic reading: hybrid_score = 0.5*(a+b) >= 0.99 forces max(a, b) >=
0.99, i.e. at least one evidence value must itself be at (or past) the
~99th-percentile bar each individual detector already uses for its own
contamination/percentile threshold -- so the 0.99 cutoff is not an
arbitrary constant, it is the smallest round threshold consistent with
"at least one detector must independently agree."

Trade-off, stated rather than hidden: this is a deliberately
conservative POC choice. At the looser 0.98 cutoff, 1,186 rows (13.6% of
that threshold's flags) are cases where both detectors are moderately,
but not individually alarmingly, elevated -- exactly the kind of
"neither alone is sure, but together the evidence is stronger" case a
hybrid detector exists to catch. At 0.99, that category is excluded
entirely, so this module currently behaves closer to "a shared ranking
over the union of the two individual anomaly sets" than a source of
brand-new joint-evidence discoveries. See the validation report and
final summary for this trade-off's effect on the results.

Severe-drop override
------------------------
At HYBRID_ANOMALY_THRESHOLD alone, every flagged anomaly is a Spike --
zero Drops, even though statistical_detector.py independently identifies
severe drops (including robust_score == -inf, its strongest possible
evidence). Investigation (see conversation notes) found the cause and
ruled out two fixes before adopting a third:

  * NOT the threshold alone: max hybrid_score achievable by any drop is
    0.9895, just under 0.99, but this ceiling exists at every threshold
    near it -- there is no round cutoff that admits a meaningful number
    of drops without also admitting rows with weak, uncorroborated
    combined evidence (at 0.98, drops still contribute 0 of the flags).
  * IS the Isolation Forest feature representation, combined with an
    inherent property of the data: energy_sum can't go negative, so
    relative_deviation (isolation_forest_detector.py) is bounded below
    at -1 but unbounded above. "Flat baseline collapses to (near) zero"
    is therefore a common pattern many different meters share -- common
    patterns are, correctly, not what an isolation-based model treats as
    rare/isolated. The 653 eligible rows with statistical_score == -inf
    all reach only if_evidence 0.836-0.979 (never 0.99). This is not
    statistical_detector.py behaving badly -- its own docstring already
    documents and justifies the -inf case -- the problem is specific to
    combining it with Isolation Forest's rarity-based scoring for this
    one direction.
  * Confirmed IF is not simply "worse" at ranking drop severity, it is
    ranking something close to unrelated: the top 200 eligible drops by
    if_evidence and the top 200 by statistical_evidence share ZERO rows
    in common, and correlation(if_score, |statistical_score|) restricted
    to drops is 0.13 (essentially none), vs. a real, usable relationship
    for spikes. Requiring IF corroboration for drops therefore is not
    "requiring a second opinion" the way it usefully is for spikes -- it
    is requiring agreement from a signal that is not measuring the same
    thing for this direction.

Two candidate fixes were tested and rejected:
  * A drop-specific hybrid_score threshold, found the same way as
    HYBRID_ANOMALY_THRESHOLD (the point where the "neither individual
    detector agrees" count hits zero *within drops only*): that point is
    0.975, admitting only 198 of 507,200 drop rows (0.039%). Checking
    those 198 against the severe-drop set below showed they are almost
    entirely the upper tail of it, selected by requiring incidentally
    high if_evidence that (per the paragraph above) does not actually
    track drop severity -- so this threshold does not add information,
    it just prunes valid statistical evidence by an uninformative
    second criterion.
  * Matching drops to spikes' flag *rate* (the drop hybrid_score
    percentile that flags the same 0.87%-of-population share spikes get)
    was tested and rejected outright: it requires a cutoff of 0.9256,
    which would flag 4,435 drops, 3,860 of them (87%) agreed on by
    *neither* individual detector -- exactly the low-quality, forced-rate
    outcome the task rules out.

Adopted instead: is_severe_drop = eligible & (deviation < 0) &
is_statistical_anomaly, then is_anomaly = is_hybrid_anomaly OR
is_severe_drop. This introduces no new constant -- is_statistical_anomaly
is statistical_detector.py's own already-justified decision (see its
docstring), reused unchanged; deviation < 0 is a sign check, not a
magic number. It never overlaps with is_hybrid_anomaly (0 of the 670
qualifying rows also clear HYBRID_ANOMALY_THRESHOLD), so it purely adds
drop coverage rather than double-counting. hybrid_score itself is
unmodified by this rule -- it stays the continuous ranking; only the
binary anomaly_status decision gains this second, direction-specific
path. Caveat, not hidden: the 670 qualifying rows span 223 meters but
are concentrated on a handful of them (one meter alone contributes 32),
consistent with a few low/intermittent-consumption meters whose "off"
days repeatedly look extreme against a baseline set by an occasional
"on" day -- a pre-existing property of the statistical detector's own
zero-MAD handling, not something newly introduced here.

Eligibility
------------
A row is hybrid-eligible iff isolation_forest_detector.
_if_eligibility_status(features) == "eligible". This is reused directly
(not recomputed): that status already nests every statistical_detector
eligibility requirement (it starts from statistical_detector.
_eligibility_status and only narrows it further for undefined relative
baselines -- see isolation_forest_detector.py), so hybrid eligibility is
exactly IF eligibility, with no separate intersection logic needed.
eligibility_status in the output reuses these same category labels
(insufficient_history / gap_in_history / incomplete_day /
undefined_relative_baseline / eligible) unchanged.

Anomaly type (Spike / Drop / Other)
---------------------------------------
For rows with anomaly_status == "Anomaly" only: Spike if deviation > 0
(today's consumption above its own rolling baseline), Drop if deviation
< 0 (this now includes rows admitted only via the severe-drop override
above), Other if deviation == 0 (evidence is directionless). Normal rows
get None -- classifying a non-anomaly's "direction" is not meaningful.

Confidence
-----------
For anomaly rows only: "Both" if both is_statistical_anomaly and
is_if_anomaly are independently True, "Single" if exactly one is, and
"Combined" if neither individual detector flagged the row but the
averaged evidence still cleared HYBRID_ANOMALY_THRESHOLD. This is read
directly off the two detectors' own decisions -- no probability is
manufactured. Given the threshold chosen above, "Combined" is expected
to be empty in this run (that emptiness is itself part of the threshold
validation, not assumed here); the field is still computed generally
rather than hardcoded, since a future threshold change should not
silently break this label.

Output
-------
One row per input (LCLid, day) row (no rows added or dropped):
LCLid, day, energy_sum, expected_consumption (rolling_7d_median),
deviation (deviation_from_rolling_median), statistical_score
(robust_score), statistical_evidence, if_score, if_evidence,
hybrid_score, anomaly_status ("Normal"/"Anomaly", None if ineligible),
anomaly_type, confidence, is_complete_day, eligibility_status.
"""

from time import perf_counter

import numpy as np
import pandas as pd

from data_validation import load_dataset
from feature_engineering import build_features
from isolation_forest_detector import score_isolation_forest_anomalies
from statistical_detector import score_statistical_anomalies

STATISTICAL_WEIGHT = 0.5
IF_WEIGHT = 0.5
HYBRID_ANOMALY_THRESHOLD = 0.99


def score_hybrid_anomalies(features: pd.DataFrame, stat_result: pd.DataFrame, if_result: pd.DataFrame) -> pd.DataFrame:
    """Combine the statistical and Isolation Forest detectors into one
    hybrid score and decision. One output row per input row.
    """
    result = features[["LCLid", "day", "energy_sum", "rolling_7d_median", "deviation_from_rolling_median", "is_complete_day"]].merge(
        stat_result[["LCLid", "day", "robust_score", "is_statistical_anomaly"]], on=["LCLid", "day"]
    ).merge(
        if_result[["LCLid", "day", "if_eligibility_status", "if_score", "is_if_anomaly"]], on=["LCLid", "day"]
    )
    result = result.rename(
        columns={
            "rolling_7d_median": "expected_consumption",
            "deviation_from_rolling_median": "deviation",
            "robust_score": "statistical_score",
            "if_eligibility_status": "eligibility_status",
        }
    )

    eligible = result["eligibility_status"] == "eligible"

    result["statistical_evidence"] = np.nan
    result["if_evidence"] = np.nan
    result.loc[eligible, "statistical_evidence"] = result.loc[eligible, "statistical_score"].abs().rank(pct=True)
    result.loc[eligible, "if_evidence"] = result.loc[eligible, "if_score"].rank(pct=True)

    result["hybrid_score"] = STATISTICAL_WEIGHT * result["statistical_evidence"] + IF_WEIGHT * result["if_evidence"]

    is_hybrid_anomaly = eligible & (result["hybrid_score"] >= HYBRID_ANOMALY_THRESHOLD)
    is_severe_drop = eligible & (result["deviation"] < 0) & result["is_statistical_anomaly"]
    is_anomaly = is_hybrid_anomaly | is_severe_drop
    result["anomaly_status"] = np.where(eligible, np.where(is_anomaly, "Anomaly", "Normal"), None)

    result["anomaly_type"] = np.select(
        [is_anomaly & (result["deviation"] > 0), is_anomaly & (result["deviation"] < 0), is_anomaly],
        ["Spike", "Drop", "Other"],
        default=None,
    )

    both = is_anomaly & result["is_statistical_anomaly"] & result["is_if_anomaly"]
    single = is_anomaly & (result["is_statistical_anomaly"] ^ result["is_if_anomaly"])
    combined_only = is_anomaly & ~result["is_statistical_anomaly"] & ~result["is_if_anomaly"]
    result["confidence"] = np.select([both, single, combined_only], ["Both", "Single", "Combined"], default=None)

    result.attrs["threshold"] = HYBRID_ANOMALY_THRESHOLD
    result.attrs["statistical_weight"] = STATISTICAL_WEIGHT
    result.attrs["if_weight"] = IF_WEIGHT

    return result[
        [
            "LCLid", "day", "energy_sum", "expected_consumption", "deviation",
            "statistical_score", "statistical_evidence", "if_score", "if_evidence",
            "hybrid_score", "anomaly_status", "anomaly_type", "confidence",
            "is_complete_day", "eligibility_status",
        ]
    ]


def validate_hybrid(result: pd.DataFrame, stat_result: pd.DataFrame, if_result: pd.DataFrame) -> dict:
    report = {}
    n = len(result)
    report["row_count"] = n
    report["threshold"] = result.attrs["threshold"]

    status_counts = result["eligibility_status"].value_counts()
    report["eligibility_counts"] = status_counts.to_dict()
    eligible = result.loc[result["eligibility_status"] == "eligible"]
    report["eligible_count"] = len(eligible)

    report["statistical_anomaly_count"] = int(stat_result["is_statistical_anomaly"].sum())
    report["if_anomaly_count"] = int(if_result["is_if_anomaly"].sum())
    report["hybrid_anomaly_count"] = int((result["anomaly_status"] == "Anomaly").sum())
    report["hybrid_anomaly_pct"] = float(report["hybrid_anomaly_count"] / len(eligible) * 100)

    report["hybrid_score_describe"] = eligible["hybrid_score"].describe().to_dict()
    report["statistical_evidence_describe"] = eligible["statistical_evidence"].describe().to_dict()
    report["if_evidence_describe"] = eligible["if_evidence"].describe().to_dict()

    # three-way overlap
    joined = eligible.merge(
        if_result[["LCLid", "day", "is_if_anomaly"]], on=["LCLid", "day"]
    ).merge(
        stat_result[["LCLid", "day", "is_statistical_anomaly"]], on=["LCLid", "day"]
    )
    joined["is_hybrid_anomaly"] = joined["anomaly_status"] == "Anomaly"
    venn = joined.groupby(
        ["is_statistical_anomaly", "is_if_anomaly", "is_hybrid_anomaly"], observed=True
    ).size()
    report["three_way_overlap"] = venn

    anomalies = eligible.loc[eligible["anomaly_status"] == "Anomaly"]
    report["anomaly_type_counts"] = anomalies["anomaly_type"].value_counts().to_dict()
    report["confidence_counts"] = anomalies["confidence"].value_counts().to_dict()

    # tertile bias check on the final hybrid decision
    meter_level = eligible.groupby("LCLid")["energy_sum"].median()
    tertile = pd.qcut(meter_level, 3, labels=["low", "mid", "high"])
    tertile_summary = eligible.assign(consumption_tertile=eligible["LCLid"].map(tertile)).groupby(
        "consumption_tertile", observed=True
    ).agg(n_rows=("anomaly_status", "size"), n_anomalies=("anomaly_status", lambda s: (s == "Anomaly").sum()))
    tertile_summary["anomaly_pct"] = tertile_summary["n_anomalies"] / tertile_summary["n_rows"] * 100
    report["tertile_summary"] = tertile_summary

    top_n = 20
    report["top_anomalies"] = anomalies.reindex(
        anomalies["hybrid_score"].sort_values(ascending=False).index
    ).head(top_n)[
        ["LCLid", "day", "energy_sum", "expected_consumption", "deviation", "statistical_score", "if_score", "hybrid_score", "anomaly_type", "confidence"]
    ]

    # "Representative" = the meter closest to its own tertile's median consumption,
    # not the single most extreme meter -- the extreme low end includes near-vacant
    # meters with only a handful of eligible rows, which describe an edge case, not
    # a typical low-consumption meter.
    report["representative_meters"] = {}
    for label in ["low", "mid", "high"]:
        tier_levels = meter_level[tertile == label]
        meter = (tier_levels - tier_levels.median()).abs().idxmin()
        rows = eligible.loc[eligible["LCLid"] == meter]
        report["representative_meters"][f"{label}:{meter}"] = {
            "median_energy_sum": float(meter_level[meter]),
            "eligible_rows": len(rows),
            "anomalies": int((rows["anomaly_status"] == "Anomaly").sum()),
            "spikes": int((rows["anomaly_type"] == "Spike").sum()),
            "drops": int((rows["anomaly_type"] == "Drop").sum()),
        }

    report["memory_mb"] = float(result.memory_usage(deep=True).sum() / 1_048_576)

    return report


def print_report(report: dict, build_seconds: float) -> None:
    print("=" * 70)
    print("HYBRID ANOMALY DETECTOR VALIDATION REPORT")
    print("=" * 70)

    print(f"\nTotal rows: {report['row_count']}")
    print("Eligibility status counts:")
    for status, count in report["eligibility_counts"].items():
        print(f"  {status}: {count}")
    print(f"Eligible rows: {report['eligible_count']}")

    print(f"\nHybrid threshold: {report['threshold']}")
    print(f"Statistical anomalies: {report['statistical_anomaly_count']}")
    print(f"Isolation Forest anomalies: {report['if_anomaly_count']}")
    print(f"Hybrid anomalies: {report['hybrid_anomaly_count']} ({report['hybrid_anomaly_pct']:.3f}% of eligible)")

    print("\nhybrid_score distribution (eligible rows):")
    for k, v in report["hybrid_score_describe"].items():
        print(f"  {k}: {v:.4f}")
    print("\nstatistical_evidence distribution:")
    for k, v in report["statistical_evidence_describe"].items():
        print(f"  {k}: {v:.4f}")
    print("\nif_evidence distribution:")
    for k, v in report["if_evidence_describe"].items():
        print(f"  {k}: {v:.4f}")

    print("\nThree-way overlap (is_statistical_anomaly, is_if_anomaly, is_hybrid_anomaly) -> row count:")
    print(report["three_way_overlap"].to_string())

    print("\nAnomaly type counts:")
    for k, v in report["anomaly_type_counts"].items():
        print(f"  {k}: {v}")
    print("\nConfidence counts:")
    for k, v in report["confidence_counts"].items():
        print(f"  {k}: {v}")

    print("\nAnomaly rate by meter consumption tertile:")
    print(report["tertile_summary"].to_string())

    print("\nTop 20 hybrid anomalies:")
    print(report["top_anomalies"].to_string(index=False))

    print("\nRepresentative meters (low / mid / high median energy_sum):")
    for meter, info in report["representative_meters"].items():
        print(f"  {meter}: {info}")

    print(f"\nOutput memory usage: {report['memory_mb']:.1f} MB")
    print(f"Runtime (build features + score all 3 detectors): {build_seconds:.2f}s")
    print("=" * 70)


if __name__ == "__main__":
    df = load_dataset()

    t0 = perf_counter()
    features = build_features(df)
    stat_result = score_statistical_anomalies(features)
    if_result = score_isolation_forest_anomalies(features)
    hybrid_result = score_hybrid_anomalies(features, stat_result, if_result)
    build_seconds = perf_counter() - t0

    report = validate_hybrid(hybrid_result, stat_result, if_result)
    print_report(report, build_seconds)
