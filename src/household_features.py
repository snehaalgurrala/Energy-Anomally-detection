"""Analytical feature layer for the raw half-hourly household consumption
data (data/block_0.csv joined with data/informations_households.csv).

Builds strictly on top of src/household_consumption.py's loader/join --
never re-implements loading or joining. Produces three explainable,
deterministic pandas tables meant to later feed a dashboard, tariff/segment
comparisons, or AI/RAG context:

  * half-hourly table -- raw readings + calendar/time features + per-reading
    flags (one row per original block_0.csv reading)
  * daily table        -- per (LCLid, date) aggregates and daily behavior
  * household table    -- per-LCLid summary across all of that meter's days

This is a feature layer only: no ML model, no resampling, no imputation,
and nothing is written to disk.

Missing-data handling (see also src/household_consumption.py):
  * A missing energy(kWh/hh) reading is never treated as 0. Aggregates use
    pandas' skip-NaN behavior, except `sum`, which pandas would otherwise
    turn into 0 for an all-NaN group -- `min_count=1` is used everywhere a
    sum is taken so a day/window with zero real readings stays NaN.
  * Irregular timestamp intervals (see profiling) are never patched by
    inventing rows: reading_count/completeness_rate are computed from
    whatever timestamps are actually present, nothing is reindexed onto a
    synthetic full-day calendar.

Run directly to print a validation + performance report against the real
local files:
    python src/household_features.py
"""

from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd

from household_consumption import ENERGY_COL, build_household_consumption, load_block, load_households

METADATA_COLS = ["stdorToU", "Acorn", "Acorn_grouped"]
GROUP_KEYS = ["LCLid", "date"]

SEASON_BY_MONTH = {
    12: "winter", 1: "winter", 2: "winter",
    3: "spring", 4: "spring", 5: "spring",
    6: "summer", 7: "summer", 8: "summer",
    9: "autumn", 10: "autumn", 11: "autumn",
}

# Time-of-day windows used for the pattern features below, defined on the
# local clock hour (0-23), half-open, documented here rather than inferred:
#   morning   06:00-11:59
#   afternoon 12:00-17:59
#   evening   18:00-21:59
#   overnight 22:00-05:59 (wraps past midnight)
TIME_WINDOWS = {
    "morning_consumption": (6, 11),
    "afternoon_consumption": (12, 17),
    "evening_consumption": (18, 21),
}


def infer_reading_interval_minutes(df: pd.DataFrame) -> int:
    """Infer the dataset's half-hourly granularity from the data itself --
    the modal gap between consecutive readings of the same meter -- rather
    than hardcoding 30. Used to derive expected_reading_count."""
    sorted_ts = df.dropna(subset=["tstp"])[["LCLid", "tstp"]].sort_values(["LCLid", "tstp"])
    same_meter = sorted_ts["LCLid"] == sorted_ts["LCLid"].shift(1)
    deltas = sorted_ts["tstp"].diff()[same_meter]
    modal_delta = deltas.mode().iloc[0]
    return int(modal_delta.total_seconds() // 60)


def expected_daily_reading_count(interval_minutes: int) -> int:
    return (24 * 60) // interval_minutes


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add deterministic calendar/time-of-day columns derived from tstp."""
    df = df.copy()
    ts = df["tstp"]
    df["date"] = ts.dt.normalize()
    df["hour"] = ts.dt.hour
    df["half_hour"] = ts.dt.minute // 30  # 0 = the :00 slot, 1 = the :30 slot
    df["day_of_week"] = ts.dt.dayofweek  # Monday=0 .. Sunday=6
    df["day_name"] = ts.dt.day_name()
    df["week"] = ts.dt.isocalendar().week.astype(int)
    df["month"] = ts.dt.month
    df["month_name"] = ts.dt.month_name()
    df["season"] = df["month"].map(SEASON_BY_MONTH)
    df["is_weekend"] = df["day_of_week"] >= 5
    return df


def build_half_hourly_features(
    block_df: pd.DataFrame | None = None,
    households_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Raw joined readings + calendar features + per-reading missing/zero flags.

    All raw columns (LCLid, tstp, energy(kWh/hh), stdorToU, Acorn,
    Acorn_grouped) are preserved unchanged; everything else here is additive.
    """
    joined = build_household_consumption(block_df, households_df)
    featured = add_time_features(joined)
    featured["is_missing_energy"] = featured[ENERGY_COL].isna()
    featured["is_zero_energy"] = featured[ENERGY_COL] == 0  # NaN == 0 is False, so this never double-counts missing
    return featured


def _sum_min_count1(s: pd.Series) -> float:
    return s.sum(min_count=1)


def build_daily_features(
    half_hourly_df: pd.DataFrame, interval_minutes: int | None = None
) -> pd.DataFrame:
    """Per (LCLid, date) aggregation, daily behavior, and time-window features."""
    if interval_minutes is None:
        interval_minutes = infer_reading_interval_minutes(half_hourly_df)
    expected_count = expected_daily_reading_count(interval_minutes)

    daily = half_hourly_df.groupby(GROUP_KEYS, sort=False)[ENERGY_COL].agg(
        daily_total=_sum_min_count1,
        daily_mean="mean",
        daily_min="min",
        daily_max="max",
        daily_std="std",
        daily_median="median",
    ).reset_index()

    counts = half_hourly_df.groupby(GROUP_KEYS, sort=False).agg(
        reading_count=("tstp", "count"),
        missing_reading_count=("is_missing_energy", "sum"),
        zero_reading_count=("is_zero_energy", "sum"),
    ).reset_index()
    daily = daily.merge(counts, on=GROUP_KEYS)

    daily["expected_reading_count"] = expected_count
    daily["completeness_rate"] = daily["reading_count"] / expected_count
    non_missing = daily["reading_count"] - daily["missing_reading_count"]
    daily["zero_reading_rate"] = np.where(
        non_missing > 0, daily["zero_reading_count"] / non_missing, np.nan
    )
    daily["minimum_consumption"] = daily["daily_min"]

    # peak_hour / peak_consumption: the half-hour with the highest recorded
    # energy that day. NaN for a day whose readings are all missing.
    non_na = half_hourly_df.dropna(subset=[ENERGY_COL])
    if len(non_na):
        peak_idx = non_na.groupby(GROUP_KEYS, sort=False)[ENERGY_COL].idxmax()
        peaks = half_hourly_df.loc[peak_idx, GROUP_KEYS + ["hour", ENERGY_COL]].rename(
            columns={"hour": "peak_hour", ENERGY_COL: "peak_consumption"}
        )
        daily = daily.merge(peaks, on=GROUP_KEYS, how="left")
    else:
        daily["peak_hour"] = np.nan
        daily["peak_consumption"] = np.nan

    for col, (start_hour, end_hour) in TIME_WINDOWS.items():
        mask = half_hourly_df["hour"].between(start_hour, end_hour)
        windowed = half_hourly_df.loc[mask].groupby(GROUP_KEYS, sort=False)[ENERGY_COL].agg(_sum_min_count1)
        daily = daily.merge(windowed.rename(col), on=GROUP_KEYS, how="left")

    overnight_mask = ~half_hourly_df["hour"].between(6, 21)
    overnight = half_hourly_df.loc[overnight_mask].groupby(GROUP_KEYS, sort=False)[ENERGY_COL].agg(_sum_min_count1)
    daily = daily.merge(overnight.rename("overnight_consumption"), on=GROUP_KEYS, how="left")

    static_cols = GROUP_KEYS + ["day_of_week", "day_name", "week", "month", "month_name", "season", "is_weekend"] + METADATA_COLS
    static = half_hourly_df[static_cols].drop_duplicates(subset=GROUP_KEYS)
    daily = static.merge(daily, on=GROUP_KEYS)

    return daily


def build_household_summary(daily_df: pd.DataFrame) -> pd.DataFrame:
    """Per-LCLid summary across all of that meter's days.

    Averages skip NaN daily_total values (fully-missing days) automatically,
    so a data gap never drags a household's averages toward zero.
    """
    summary = daily_df.groupby("LCLid", sort=False)["daily_total"].agg(
        average_daily_consumption="mean",
        median_daily_consumption="median",
        max_daily_consumption="max",
        minimum_daily_consumption="min",
        consumption_std="std",
    ).reset_index()
    summary["consumption_variability"] = summary["consumption_std"] / summary["average_daily_consumption"]

    weekday_avg = (
        daily_df.loc[~daily_df["is_weekend"]]
        .groupby("LCLid", sort=False)["daily_total"].mean()
        .rename("average_weekday_consumption")
    )
    weekend_avg = (
        daily_df.loc[daily_df["is_weekend"]]
        .groupby("LCLid", sort=False)["daily_total"].mean()
        .rename("average_weekend_consumption")
    )
    summary = summary.merge(weekday_avg, on="LCLid", how="left").merge(weekend_avg, on="LCLid", how="left")
    summary["weekend_vs_weekday_ratio"] = (
        summary["average_weekend_consumption"] / summary["average_weekday_consumption"]
    )

    metadata = daily_df[["LCLid"] + METADATA_COLS].drop_duplicates(subset="LCLid")
    summary = metadata.merge(summary, on="LCLid")

    return summary


def build_monthly_trend(daily_df: pd.DataFrame) -> pd.DataFrame:
    """Dataset-wide average daily consumption per calendar month, across all households.

    Grouped on the calendar month/year derived from `date` -- not the `month`
    column, which is 1-12 with no year and would conflate e.g. Jan-2012 with
    Jan-2013. Averages skip NaN daily_total values (fully-missing days) the
    same way build_household_summary does, so a data gap never drags a
    month's average toward zero.
    """
    month = daily_df["date"].dt.to_period("M").dt.to_timestamp().rename("month")
    trend = (
        daily_df.groupby(month, sort=True)["daily_total"]
        .agg(average_daily_consumption="mean", household_day_count="count")
        .reset_index()
    )
    return trend


def _count_infinite_values(df: pd.DataFrame) -> int:
    numeric = df.select_dtypes(include=[np.number]).to_numpy(dtype="float64", na_value=np.nan)
    return int(np.isinf(numeric).sum())


def build_validation_report(
    raw_block_df: pd.DataFrame,
    half_hourly_df: pd.DataFrame,
    daily_df: pd.DataFrame,
    household_df: pd.DataFrame,
    timings: dict,
) -> dict:
    return {
        "input_rows": int(len(raw_block_df)),
        "output_rows_half_hourly": int(len(half_hourly_df)),
        "meters": int(half_hourly_df["LCLid"].nunique()),
        "date_min": half_hourly_df["date"].min(),
        "date_max": half_hourly_df["date"].max(),
        "missing_energy_values": int(half_hourly_df["is_missing_energy"].sum()),
        "incomplete_days": int((daily_df["completeness_rate"] < 1.0).sum()),
        "completely_missing_days": int(daily_df["daily_total"].isna().sum()),
        "half_hourly_columns": int(half_hourly_df.shape[1]),
        "daily_columns": int(daily_df.shape[1]),
        "household_columns": int(household_df.shape[1]),
        "duplicate_lclid_tstp_keys": int(half_hourly_df.duplicated(subset=["LCLid", "tstp"]).sum()),
        "infinite_values_daily": _count_infinite_values(daily_df),
        "infinite_values_household": _count_infinite_values(household_df),
        "timings_seconds": timings,
    }


def print_validation_report(
    report: dict, half_hourly_df: pd.DataFrame, daily_df: pd.DataFrame, household_df: pd.DataFrame
) -> None:
    print("=" * 70)
    print("HOUSEHOLD FEATURE LAYER -- VALIDATION REPORT")
    print("=" * 70)
    print(f"Input rows (block_0.csv):                     {report['input_rows']}")
    print(f"Output rows (half-hourly table):               {report['output_rows_half_hourly']}")
    print(f"Meters:                                        {report['meters']}")
    print(f"Date range:                                    {report['date_min'].date()} to {report['date_max'].date()}")
    print(f"Missing energy values:                          {report['missing_energy_values']}")
    print(f"Incomplete days (completeness_rate < 1.0):      {report['incomplete_days']} / {len(daily_df)}")
    print(f"Completely missing days (all readings NaN):     {report['completely_missing_days']}")
    print(f"Half-hourly table columns:                      {report['half_hourly_columns']}")
    print(f"Daily table columns:                            {report['daily_columns']}")
    print(f"Household table columns:                        {report['household_columns']}")
    print(f"Duplicate (LCLid, tstp) keys introduced:        {report['duplicate_lclid_tstp_keys']}")
    print(f"Infinite values in daily table:                 {report['infinite_values_daily']}")
    print(f"Infinite values in household table:             {report['infinite_values_household']}")

    print("\nTimings:")
    for k, v in report["timings_seconds"].items():
        print(f"  {k}: {v:.3f}s")

    sample_meter = daily_df["LCLid"].iloc[0]
    sample_day = daily_df.loc[daily_df["LCLid"] == sample_meter].iloc[0]
    print(f"\nRepresentative daily row (LCLid={sample_meter}, date={sample_day['date'].date()}):")
    print(sample_day.to_string())

    sample_summary = household_df.loc[household_df["LCLid"] == sample_meter].iloc[0]
    print(f"\nRepresentative household summary (LCLid={sample_meter}):")
    print(sample_summary.to_string())
    print("=" * 70)


if __name__ == "__main__":
    t0 = perf_counter()
    block_df = load_block()
    households_df = load_households()
    load_seconds = perf_counter() - t0

    t0 = perf_counter()
    half_hourly_df = build_half_hourly_features(block_df, households_df)
    feature_seconds = perf_counter() - t0

    t0 = perf_counter()
    daily_df = build_daily_features(half_hourly_df)
    household_df = build_household_summary(daily_df)
    aggregation_seconds = perf_counter() - t0

    timings = {
        "load": load_seconds,
        "half_hourly_feature_generation": feature_seconds,
        "daily_and_household_aggregation": aggregation_seconds,
    }

    report = build_validation_report(block_df, half_hourly_df, daily_df, household_df, timings)
    print_validation_report(report, half_hourly_df, daily_df, household_df)
