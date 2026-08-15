"""Read-only profiling of the two newly added local datasets.

Covers data/block_0.csv (raw half-hourly consumption) and
data/informations_households.csv (household metadata), plus a
cross-dataset check on how they relate via LCLid.

This does not touch the existing daily_dataset.csv.xlsx pipeline
(data_validation.py, pipeline.py, the detectors, results_store.py).
It only reads the two new CSVs and prints a report — nothing is
cleaned, filled, dropped, or written back to disk.

Run directly to print the full report:
    python src/profile_new_datasets.py
"""

import numpy as np
import pandas as pd

from household_consumption import ENERGY_COL, load_block, load_households

EXPECTED_INTERVAL_MINUTES = 30


def profile_block(df: pd.DataFrame) -> dict:
    p = {}
    p["shape"] = df.shape
    p["columns"] = list(df.columns)
    p["dtypes"] = df.dtypes.astype(str).to_dict()
    p["missing_per_column"] = df.isna().sum().to_dict()

    p["duplicate_rows"] = int(df.duplicated().sum())
    p["duplicate_lclid_tstp"] = int(df.duplicated(subset=["LCLid", "tstp"]).sum())

    p["unique_meters"] = int(df["LCLid"].nunique())
    p["tstp_min"] = df["tstp"].min()
    p["tstp_max"] = df["tstp"].max()

    readings_per_meter = df.groupby("LCLid").size()
    p["readings_per_meter_describe"] = readings_per_meter.describe().to_dict()
    p["readings_per_meter_hist"] = (
        pd.cut(readings_per_meter, bins=10).value_counts().sort_index().astype(str).to_dict()
    )

    # Timestamp continuity: expected one reading every 30 minutes per meter.
    # Vectorized: sort by (LCLid, tstp), diff within each meter, drop the
    # boundary row where the diff spans two different meters.
    sorted_ts = df.dropna(subset=["tstp"])[["LCLid", "tstp"]].sort_values(["LCLid", "tstp"])
    deltas = sorted_ts["tstp"].diff()
    same_meter = sorted_ts["LCLid"] == sorted_ts["LCLid"].shift(1)
    within_meter_deltas = deltas[same_meter]

    total_intervals = int(len(within_meter_deltas))
    non_standard = within_meter_deltas != pd.Timedelta(minutes=EXPECTED_INTERVAL_MINUTES)
    total_gaps = int(non_standard.sum())
    p["intervals_checked"] = total_intervals
    p["non_standard_intervals"] = total_gaps
    p["non_standard_interval_pct"] = (
        float(total_gaps / total_intervals * 100) if total_intervals else 0.0
    )

    p["energy_missing_after_coercion"] = int(df[ENERGY_COL].isna().sum())
    non_null_energy = df[ENERGY_COL].dropna()
    p["zero_readings"] = int((non_null_energy == 0).sum())
    p["negative_readings"] = int((non_null_energy < 0).sum())
    p["energy_stats"] = non_null_energy.describe().to_dict()

    return p


def profile_households(df: pd.DataFrame) -> dict:
    p = {}
    p["shape"] = df.shape
    p["columns"] = list(df.columns)
    p["dtypes"] = df.dtypes.astype(str).to_dict()
    p["missing_per_column"] = df.isna().sum().to_dict()

    p["duplicate_lclid"] = int(df["LCLid"].duplicated().sum())
    p["unique_lclid"] = int(df["LCLid"].nunique())

    p["stdortou_distribution"] = df["stdorToU"].value_counts(dropna=False).to_dict()
    p["acorn_distribution"] = df["Acorn"].value_counts(dropna=False).to_dict()
    p["acorn_grouped_distribution"] = df["Acorn_grouped"].value_counts(dropna=False).to_dict()

    return p


def cross_validate(block_df: pd.DataFrame, households_df: pd.DataFrame) -> dict:
    c = {}
    block_meters = set(block_df["LCLid"].unique())
    meta_meters = set(households_df["LCLid"].unique())

    c["consumption_meter_count"] = len(block_meters)
    c["metadata_meter_count"] = len(meta_meters)
    c["meters_with_metadata"] = len(block_meters & meta_meters)
    c["meters_without_metadata"] = len(block_meters - meta_meters)
    c["metadata_without_consumption"] = len(meta_meters - block_meters)

    c["duplicate_metadata_records_per_lclid"] = int(households_df["LCLid"].duplicated().sum())

    records_with_metadata = block_df["LCLid"].isin(meta_meters).sum()
    c["records_with_metadata_pct"] = float(records_with_metadata / len(block_df) * 100)

    return c


def print_report(block_p: dict, households_p: dict, cross_p: dict) -> None:
    print("=" * 70)
    print("BLOCK_0.CSV PROFILE (raw half-hourly consumption)")
    print("=" * 70)
    print(f"Shape (rows, cols): {block_p['shape']}")
    print(f"Columns: {block_p['columns']}")
    print("\nData types:")
    for col, dtype in block_p["dtypes"].items():
        print(f"  {col}: {dtype}")

    print("\nMissing values per column (after numeric/datetime coercion):")
    for col, n in block_p["missing_per_column"].items():
        print(f"  {col}: {n}")
    print(f"  (of which {ENERGY_COL} unparseable as numeric: {block_p['energy_missing_after_coercion']})")

    print(f"\nFully duplicate rows: {block_p['duplicate_rows']}")
    print(f"Duplicate (LCLid, tstp) keys: {block_p['duplicate_lclid_tstp']}")

    print(f"\nUnique meters (LCLid): {block_p['unique_meters']}")
    print(f"Timestamp range: {block_p['tstp_min']} to {block_p['tstp_max']}")

    print("\nReadings per meter (describe):")
    for k, v in block_p["readings_per_meter_describe"].items():
        print(f"  {k}: {v:.2f}")
    print("Readings per meter (histogram, 10 bins):")
    for bucket, n in block_p["readings_per_meter_hist"].items():
        print(f"  {bucket}: {n}")

    print(
        f"\nTimestamp continuity (expected {EXPECTED_INTERVAL_MINUTES}-min interval): "
        f"{block_p['intervals_checked']} consecutive intervals checked"
    )
    print(
        f"Non-standard intervals (gaps/overlaps/DST artifacts): "
        f"{block_p['non_standard_intervals']} ({block_p['non_standard_interval_pct']:.3f}%)"
    )

    print(f"\nZero-consumption readings: {block_p['zero_readings']}")
    print(f"Negative-consumption readings: {block_p['negative_readings']}")
    print("\nConsumption statistics (energy(kWh/hh), non-null):")
    for k, v in block_p["energy_stats"].items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 70)
    print("INFORMATIONS_HOUSEHOLDS.CSV PROFILE (household metadata)")
    print("=" * 70)
    print(f"Shape (rows, cols): {households_p['shape']}")
    print(f"Columns: {households_p['columns']}")
    print("\nData types:")
    for col, dtype in households_p["dtypes"].items():
        print(f"  {col}: {dtype}")

    print("\nMissing values per column:")
    for col, n in households_p["missing_per_column"].items():
        print(f"  {col}: {n}")

    print(f"\nDuplicate LCLid rows: {households_p['duplicate_lclid']}")
    print(f"Unique LCLid: {households_p['unique_lclid']}")

    print("\nstdorToU distribution:")
    for k, v in households_p["stdortou_distribution"].items():
        print(f"  {k}: {v}")
    print("\nAcorn distribution:")
    for k, v in households_p["acorn_distribution"].items():
        print(f"  {k}: {v}")
    print("\nAcorn_grouped distribution:")
    for k, v in households_p["acorn_grouped_distribution"].items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 70)
    print("CROSS-DATASET VALIDATION (join key: LCLid)")
    print("=" * 70)
    print(f"Consumption meters in block_0.csv: {cross_p['consumption_meter_count']}")
    print(f"Metadata meters in informations_households.csv: {cross_p['metadata_meter_count']}")
    print(f"Consumption meters WITH matching metadata: {cross_p['meters_with_metadata']}")
    print(f"Consumption meters WITHOUT matching metadata: {cross_p['meters_without_metadata']}")
    print(f"Metadata rows with NO matching consumption meter: {cross_p['metadata_without_consumption']}")
    print(f"Duplicate metadata records per LCLid: {cross_p['duplicate_metadata_records_per_lclid']}")
    print(
        f"Consumption records belonging to meters with metadata: "
        f"{cross_p['records_with_metadata_pct']:.2f}%"
    )
    print("=" * 70)


if __name__ == "__main__":
    block_df = load_block()
    households_df = load_households()

    block_profile = profile_block(block_df)
    households_profile = profile_households(households_df)
    cross_profile = cross_validate(block_df, households_df)

    print_report(block_profile, households_profile, cross_profile)
