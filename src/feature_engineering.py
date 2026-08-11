"""Meter-aware time-series feature engineering for daily energy data.

Reuses the validated loader in data_validation.py (no re-reading, no
duplicated loading logic). Run directly to build the feature table against
the local dataset and print a validation report:

    python src/feature_engineering.py
"""

from time import perf_counter

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from data_validation import EXPECTED_DAILY_READINGS, load_dataset

ROLLING_WINDOW = 7


def _build_daily_calendar(df: pd.DataFrame) -> pd.DataFrame:
    """Return one row per LCLid per calendar day spanning that meter's first
    to last observed day. Days absent from the source data (real gaps in the
    meter's timeline) get energy_sum = NaN, so lag/rolling windows built on
    this grid never silently bridge a gap with an unrelated later reading.
    """
    bounds = df.groupby("LCLid")["day"].agg(["min", "max"])
    n_days = (bounds["max"] - bounds["min"]).dt.days.to_numpy() + 1

    # Vectorized per-group arange: offsets 0..n-1 within each meter's block.
    offsets = np.arange(n_days.sum()) - np.repeat(np.cumsum(n_days) - n_days, n_days)
    lclid_grid = np.repeat(bounds.index.to_numpy(), n_days)
    day_grid = np.repeat(bounds["min"].to_numpy(), n_days) + offsets.astype("timedelta64[D]")

    calendar = pd.DataFrame({"LCLid": lclid_grid, "day": day_grid})
    return calendar.merge(df[["LCLid", "day", "energy_sum"]], on=["LCLid", "day"], how="left")


def _rolling_median_mad(values: np.ndarray, window: int = ROLLING_WINDOW) -> tuple[np.ndarray, np.ndarray]:
    """Median and median-absolute-deviation of trailing `window`-length
    slices of `values`. A window is only evaluated when all `window` entries
    are non-null (strict min_periods == window); otherwise both outputs are
    NaN, so a single missing day makes every window that touches it NaN
    rather than silently computing on fewer than `window` days.
    """
    n = len(values)
    if n < window:
        nan_arr = np.full(n, np.nan)
        return nan_arr, nan_arr

    windows = sliding_window_view(values, window)
    missing = np.isnan(windows).any(axis=1)
    median = np.where(missing, np.nan, np.median(windows, axis=1))
    mad = np.where(missing, np.nan, np.median(np.abs(windows - median[:, None]), axis=1))

    pad = np.full(window - 1, np.nan)
    return np.concatenate([pad, median]), np.concatenate([pad, mad])


def _history_features(df: pd.DataFrame) -> pd.DataFrame:
    """Lag / rolling features on the calendar-complete grid, keyed by
    (LCLid, day) for a left-merge back onto the real rows. All windows are
    anchored strictly before the current day (previous day's shift(1) is the
    rolling series), so today's own value never contributes to its own
    baseline.
    """
    calendar = _build_daily_calendar(df).sort_values(["LCLid", "day"]).reset_index(drop=True)

    grouped = calendar.groupby("LCLid")["energy_sum"]
    previous_1d = grouped.shift(1)
    previous_7d = grouped.shift(7)

    calendar["previous_day_energy_sum"] = previous_1d
    calendar["pct_change_1d"] = np.where(
        previous_1d.notna() & (previous_1d != 0),
        (calendar["energy_sum"] - previous_1d) / previous_1d,
        np.nan,
    )
    calendar["pct_change_7d"] = np.where(
        previous_7d.notna() & (previous_7d != 0),
        (calendar["energy_sum"] - previous_7d) / previous_7d,
        np.nan,
    )

    # Rolling median/MAD over the 7 days strictly before today (previous_1d
    # is the "as of yesterday" series; rolling window 7 on it covers t-7..t-1).
    medians = np.empty(len(calendar))
    mads = np.empty(len(calendar))
    pos = 0
    for _, group_vals in previous_1d.groupby(calendar["LCLid"], sort=False):
        arr = group_vals.to_numpy()
        med, mad = _rolling_median_mad(arr)
        n = len(arr)
        medians[pos : pos + n] = med
        mads[pos : pos + n] = mad
        pos += n

    calendar["rolling_7d_median"] = medians
    calendar["rolling_7d_mad"] = mads
    calendar["deviation_from_rolling_median"] = calendar["energy_sum"] - calendar["rolling_7d_median"]

    return calendar[
        [
            "LCLid",
            "day",
            "previous_day_energy_sum",
            "pct_change_1d",
            "pct_change_7d",
            "rolling_7d_median",
            "rolling_7d_mad",
            "deviation_from_rolling_median",
        ]
    ]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build the meter-aware, time-series feature table from validated daily
    meter rows.

    One output row per input (LCLid, day) row -- no rows are added or
    dropped. All lag/rolling features use only same-meter, same-day-or-
    earlier observations; gaps in a meter's calendar (missing days, or days
    present with energy_count == 0) propagate as NaN rather than being
    bridged or filled with a fallback value.
    """
    df = df.sort_values(["LCLid", "day"]).reset_index(drop=True)

    features = df[["LCLid", "day"]].copy()

    # Calendar
    features["day_of_week"] = df["day"].dt.dayofweek
    features["month"] = df["day"].dt.month
    features["is_weekend"] = features["day_of_week"].isin([5, 6])

    # Consumption -- already aggregated to daily granularity upstream; carried
    # through as-is (NaN when energy_count == 0, i.e. no readings that day).
    for col in ["energy_sum", "energy_mean", "energy_std", "energy_min", "energy_max"]:
        features[col] = df[col]

    # Completeness
    features["energy_count"] = df["energy_count"]
    features["is_complete_day"] = df["energy_count"] == EXPECTED_DAILY_READINGS

    # Meter history / change
    features["days_since_previous_record"] = df.groupby("LCLid")["day"].diff().dt.days

    history = _history_features(df)
    features = features.merge(history, on=["LCLid", "day"], how="left", validate="one_to_one")

    return features


def validate_features(features: pd.DataFrame, source: pd.DataFrame) -> dict:
    report = {}

    report["row_count_matches"] = len(features) == len(source)
    report["columns"] = list(features.columns)
    report["no_duplicate_keys"] = not features.duplicated(subset=["LCLid", "day"]).any()

    sorted_ok = (
        features.groupby("LCLid", sort=False)["day"].apply(lambda s: s.is_monotonic_increasing).all()
    )
    report["sorted_by_meter_then_date"] = bool(sorted_ok)

    report["null_counts"] = features.isna().sum().to_dict()

    report["meters"] = int(features["LCLid"].nunique())
    report["first_record_per_meter_has_null_lag_features"] = bool(
        (
            features.loc[features["days_since_previous_record"].isna(), "previous_day_energy_sum"].isna()
        ).all()
    )

    report["rolling_mad_zero_count"] = int((features["rolling_7d_mad"] == 0).sum())
    report["rolling_mad_zero_pct_of_nonnull"] = float(
        100 * (features["rolling_7d_mad"] == 0).sum() / features["rolling_7d_mad"].notna().sum()
    )

    report["is_complete_day_count"] = int(features["is_complete_day"].sum())
    report["is_complete_day_pct"] = float(features["is_complete_day"].mean() * 100)

    report["days_since_previous_record_gt1_count"] = int((features["days_since_previous_record"] > 1).sum())

    numeric_cols = [
        "pct_change_1d",
        "pct_change_7d",
        "rolling_7d_median",
        "rolling_7d_mad",
        "deviation_from_rolling_median",
    ]
    report["feature_ranges"] = features[numeric_cols].describe().to_dict()

    report["memory_mb"] = float(features.memory_usage(deep=True).sum() / 1_048_576)

    return report


def _check_no_future_leakage(df: pd.DataFrame) -> bool:
    """Corrupt a late-history day for one meter and confirm every earlier
    row's features are unchanged -- proves rolling/lag features never look
    ahead.
    """
    meter = df["LCLid"].iloc[len(df) // 2]
    meter_rows = df.loc[df["LCLid"] == meter].sort_values("day")
    if len(meter_rows) < 20:
        return True  # not enough history on this meter to make the check meaningful

    baseline = build_features(df)
    baseline_meter = baseline.loc[baseline["LCLid"] == meter].reset_index(drop=True)

    tampered = df.copy()
    late_idx = meter_rows.index[-1]
    tampered.loc[late_idx, "energy_sum"] = tampered.loc[late_idx, "energy_sum"] + 1_000_000.0

    tampered_features = build_features(tampered)
    tampered_meter = tampered_features.loc[tampered_features["LCLid"] == meter].reset_index(drop=True)

    early = baseline_meter.iloc[:-1].drop(columns=["LCLid", "day"])
    early_tampered = tampered_meter.iloc[:-1].drop(columns=["LCLid", "day"])
    return early.equals(early_tampered)


def print_report(report: dict, leakage_ok: bool, build_seconds: float) -> None:
    print("=" * 70)
    print("FEATURE ENGINEERING VALIDATION REPORT")
    print("=" * 70)

    print(f"\nRow count matches source: {report['row_count_matches']}")
    print(f"No duplicate (LCLid, day) keys: {report['no_duplicate_keys']}")
    print(f"Sorted by meter then date: {report['sorted_by_meter_then_date']}")
    print(f"No future-data leakage (tamper test): {leakage_ok}")
    print(f"Unique meters: {report['meters']}")

    print(f"\nColumns ({len(report['columns'])}): {report['columns']}")

    print("\nNull counts per column:")
    for col, n in report["null_counts"].items():
        print(f"  {col}: {n}")

    print(
        f"\nFirst-record-per-meter rows all have null previous_day_energy_sum: "
        f"{report['first_record_per_meter_has_null_lag_features']}"
    )
    print(f"Rows following a calendar gap (days_since_previous_record > 1): {report['days_since_previous_record_gt1_count']}")

    print(
        f"\nrolling_7d_mad == 0: {report['rolling_mad_zero_count']} rows "
        f"({report['rolling_mad_zero_pct_of_nonnull']:.2f}% of non-null)"
    )

    print(
        f"\nis_complete_day: {report['is_complete_day_count']} rows "
        f"({report['is_complete_day_pct']:.2f}%)"
    )

    print("\nFeature ranges:")
    ranges_df = pd.DataFrame(report["feature_ranges"])
    print(ranges_df.to_string())

    print(f"\nFeature table memory usage: {report['memory_mb']:.1f} MB")
    print(f"Build time: {build_seconds:.2f}s")
    print("=" * 70)


if __name__ == "__main__":
    df = load_dataset()

    t0 = perf_counter()
    features = build_features(df)
    build_seconds = perf_counter() - t0

    report = validate_features(features, df)
    leakage_ok = _check_no_future_leakage(df)

    print_report(report, leakage_ok, build_seconds)
