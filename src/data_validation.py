"""Load and profile the local energy dataset (data/daily_dataset.csv.xlsx).

Run directly to print a full data-quality report:
    python src/data_validation.py
"""

from pathlib import Path

import numpy as np
import pandas as pd

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "daily_dataset.csv.xlsx"
ID_COLS = ["LCLid", "day"]
ENERGY_COLS = ["energy_median", "energy_mean", "energy_max", "energy_std", "energy_sum", "energy_min"]
EXPECTED_DAILY_READINGS = 48  # half-hourly readings per full day


def get_sheet_names(path: Path = DATA_PATH) -> list[str]:
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True)
    try:
        return wb.sheetnames
    finally:
        wb.close()


def load_dataset(path: Path = DATA_PATH) -> pd.DataFrame:
    df = pd.read_excel(path, engine="openpyxl")
    df["day"] = pd.to_datetime(df["day"])
    return df


def profile_dataset(df: pd.DataFrame) -> dict:
    profile = {}

    profile["shape"] = df.shape
    profile["columns"] = list(df.columns)
    profile["dtypes"] = df.dtypes.astype(str).to_dict()
    profile["missing_per_column"] = df.isna().sum().to_dict()

    profile["duplicate_rows"] = int(df.duplicated().sum())
    profile["duplicate_lclid_day"] = int(df.duplicated(subset=ID_COLS).sum())

    profile["unique_meters"] = int(df["LCLid"].nunique())
    profile["date_min"] = df["day"].min()
    profile["date_max"] = df["day"].max()

    records_per_meter = df.groupby("LCLid").size()
    profile["records_per_meter_describe"] = records_per_meter.describe().to_dict()

    records_per_date = df.groupby("day").size()
    profile["records_per_date_describe"] = records_per_date.describe().to_dict()

    profile["energy_count_describe"] = df["energy_count"].describe().to_dict()
    complete_days = df["energy_count"] == EXPECTED_DAILY_READINGS
    profile["complete_day_count"] = int(complete_days.sum())
    profile["complete_day_pct"] = float(complete_days.mean() * 100)

    incomplete = df.loc[~complete_days, "energy_count"]
    profile["incomplete_day_distribution"] = incomplete.value_counts().sort_index().to_dict()

    profile["energy_stats"] = df[ENERGY_COLS].describe().to_dict()

    profile["negative_values"] = {c: int((df[c] < 0).sum()) for c in ENERGY_COLS}
    profile["zero_energy_count_rows"] = int((df["energy_count"] == 0).sum())
    profile["energy_count_gt_48"] = int((df["energy_count"] > EXPECTED_DAILY_READINGS).sum())
    profile["min_gt_max_rows"] = int((df["energy_min"] > df["energy_max"]).sum())
    profile["mean_outside_min_max_rows"] = int(
        ((df["energy_mean"] < df["energy_min"]) | (df["energy_mean"] > df["energy_max"])).sum()
    )

    return profile


def sample_meter_timelines(df: pd.DataFrame, n: int = 3) -> dict:
    meters = sorted(df["LCLid"].unique())
    picks = [meters[0], meters[len(meters) // 2], meters[-1]] if len(meters) >= n else meters

    timelines = {}
    for meter in picks:
        sub = df.loc[df["LCLid"] == meter, "day"].sort_values()
        gaps = sub.diff().dt.days.dropna()
        timelines[meter] = {
            "n_records": len(sub),
            "first_day": sub.min(),
            "last_day": sub.max(),
            "expected_days_in_range": (sub.max() - sub.min()).days + 1,
            "non_daily_gap_count": int((gaps != 1).sum()),
        }
    return timelines


def print_report(profile: dict, timelines: dict, sheet_names: list[str]) -> None:
    print("=" * 70)
    print("DATASET VALIDATION REPORT")
    print("=" * 70)

    print(f"\nWorkbook sheets: {sheet_names}")
    print(f"Shape (rows, cols): {profile['shape']}")
    print(f"Columns: {profile['columns']}")
    print("\nData types:")
    for col, dtype in profile["dtypes"].items():
        print(f"  {col}: {dtype}")

    print("\nMissing values per column:")
    for col, n in profile["missing_per_column"].items():
        print(f"  {col}: {n}")

    print(f"\nFully duplicate rows: {profile['duplicate_rows']}")
    print(f"Duplicate (LCLid, day) combinations: {profile['duplicate_lclid_day']}")

    print(f"\nUnique meters (LCLid): {profile['unique_meters']}")
    print(f"Date range: {profile['date_min']} to {profile['date_max']}")

    print("\nRecords per meter (describe):")
    for k, v in profile["records_per_meter_describe"].items():
        print(f"  {k}: {v:.2f}")

    print("\nRecords per date (describe):")
    for k, v in profile["records_per_date_describe"].items():
        print(f"  {k}: {v:.2f}")

    print("\nenergy_count describe:")
    for k, v in profile["energy_count_describe"].items():
        print(f"  {k}: {v:.2f}")

    print(
        f"\nComplete days (energy_count == {EXPECTED_DAILY_READINGS}): "
        f"{profile['complete_day_count']} ({profile['complete_day_pct']:.2f}%)"
    )
    print("Incomplete-day energy_count distribution (value: n_rows):")
    for val, n in profile["incomplete_day_distribution"].items():
        print(f"  {val}: {n}")

    print("\nEnergy column statistics:")
    stats_df = pd.DataFrame(profile["energy_stats"])
    print(stats_df.to_string())

    print("\nNegative values per energy column:")
    for col, n in profile["negative_values"].items():
        print(f"  {col}: {n}")
    print(f"Rows with energy_count == 0: {profile['zero_energy_count_rows']}")
    print(f"Rows with energy_count > {EXPECTED_DAILY_READINGS}: {profile['energy_count_gt_48']}")
    print(f"Rows with energy_min > energy_max: {profile['min_gt_max_rows']}")
    print(f"Rows with energy_mean outside [energy_min, energy_max]: {profile['mean_outside_min_max_rows']}")

    print("\nSample meter timelines:")
    for meter, info in timelines.items():
        print(f"  {meter}: {info}")

    print("=" * 70)


if __name__ == "__main__":
    sheet_names = get_sheet_names()
    df = load_dataset()
    profile = profile_dataset(df)
    timelines = sample_meter_timelines(df)
    print_report(profile, timelines, sheet_names)
