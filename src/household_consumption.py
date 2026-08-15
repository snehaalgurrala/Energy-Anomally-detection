"""Load raw half-hourly consumption (data/block_0.csv) and join it with
household metadata (data/informations_households.csv) on LCLid.

This is a loading/join layer only: no cleaning, imputation, resampling, or
row dropping happens here, and nothing is written back to disk. It does not
touch the existing daily_dataset.csv.xlsx pipeline (data_validation.py,
pipeline.py, the detectors, results_store.py) or change its behavior.

Known data-quality conditions in the local datasets, left untouched here
(see src/profile_new_datasets.py for the full profiling report):

  * ~50 null energy(kWh/hh) readings in block_0.csv, preserved as NaN --
    never coerced to 0.
  * ~272 non-standard (irregular) timestamp intervals out of ~1.22M
    consecutive half-hourly readings, preserved as-is -- no resampling or
    gap-filling.
  * 2 households with Acorn == "ACORN-", the source data's sentinel for "no
    ACORN classification available". Preserved as-is, not dropped or
    relabeled. (Distinct from the "ACORN-U" Acorn_grouped category, which is
    a real, defined classification -- "Unclassified" -- not a missing value.)

Run directly to print a validation report against the real local files:
    python src/household_consumption.py
"""

from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
BLOCK_PATH = DATA_DIR / "block_0.csv"
HOUSEHOLDS_PATH = DATA_DIR / "informations_households.csv"

ENERGY_COL = "energy(kWh/hh)"
UNKNOWN_ACORN = "ACORN-"  # sentinel for "no ACORN classification available"

# `file` (the source metadata batch, e.g. "block_0") is deliberately excluded:
# it identifies where the row came from, not a property of the household.
METADATA_FIELDS = ["LCLid", "stdorToU", "Acorn", "Acorn_grouped"]


def _require(path: Path) -> Path:
    if not path.is_file():
        rel = path.relative_to(REPO_ROOT) if path.is_relative_to(REPO_ROOT) else path
        raise FileNotFoundError(
            f"Required dataset not found at '{rel}'. Place the file at this path "
            "relative to the project root before running this pipeline."
        )
    return path


def load_block(path: Path = BLOCK_PATH) -> pd.DataFrame:
    """Load raw half-hourly consumption readings.

    Unparseable energy values (blank/non-numeric strings) become NaN via
    pd.to_numeric(errors="coerce") and are never filled -- a missing reading
    stays missing, it does not become 0.
    """
    df = pd.read_csv(_require(path))
    df["tstp"] = pd.to_datetime(df["tstp"], errors="coerce")
    df[ENERGY_COL] = pd.to_numeric(df[ENERGY_COL], errors="coerce")
    return df


def load_households(path: Path = HOUSEHOLDS_PATH) -> pd.DataFrame:
    """Load household metadata, unmodified."""
    return pd.read_csv(_require(path))


def build_household_consumption(
    block_df: pd.DataFrame | None = None,
    households_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Join raw consumption with household metadata on LCLid.

    - household metadata is first restricted to the LCLids actually present
      in block_df (informations_households.csv covers many more households
      than the ones sampled in block_0.csv)
    - the join is many-to-one (many consumption rows per LCLid, at most one
      metadata row per LCLid) -- `validate="many_to_one"` makes merge raise
      if that assumption is ever violated by a future dataset
    - it's a left join on block_df, so every raw consumption row is kept
      exactly as loaded: energy values, NaNs, and timestamps pass through
      unchanged; a meter with no metadata match would get NaN metadata
      fields rather than being dropped
    """
    if block_df is None:
        block_df = load_block()
    if households_df is None:
        households_df = load_households()

    block_meters = block_df["LCLid"].unique()
    restricted_metadata = households_df.loc[
        households_df["LCLid"].isin(block_meters), METADATA_FIELDS
    ]

    return block_df.merge(
        restricted_metadata,
        on="LCLid",
        how="left",
        validate="many_to_one",
    )


def validate_household_consumption(
    block_df: pd.DataFrame, households_df: pd.DataFrame, joined_df: pd.DataFrame
) -> dict:
    """Report the data-quality facts a caller needs before trusting the join --
    computed straight from the loaded/joined frames, nothing inferred or fixed."""
    block_meters = set(block_df["LCLid"].unique())
    meta_meters = set(households_df["LCLid"].unique())
    matching_metadata = households_df.loc[households_df["LCLid"].isin(block_meters)]

    return {
        "consumption_rows": int(len(block_df)),
        "meters": int(len(block_meters)),
        "matching_metadata_rows": int(len(matching_metadata)),
        "missing_energy_values": int(block_df[ENERGY_COL].isna().sum()),
        "duplicate_lclid_tstp_keys": int(block_df.duplicated(subset=["LCLid", "tstp"]).sum()),
        "unknown_acorn_classifications": int((matching_metadata["Acorn"] == UNKNOWN_ACORN).sum()),
        "timestamp_min": block_df["tstp"].min(),
        "timestamp_max": block_df["tstp"].max(),
        "joined_rows": int(len(joined_df)),
    }


def print_validation_report(report: dict) -> None:
    print("=" * 70)
    print("HOUSEHOLD CONSUMPTION JOIN -- VALIDATION REPORT")
    print("=" * 70)
    print(f"Consumption rows (block_0.csv):              {report['consumption_rows']}")
    print(f"Meters (unique LCLid in block_0.csv):         {report['meters']}")
    print(f"Matching metadata rows:                       {report['matching_metadata_rows']}")
    print(f"Missing energy values (NaN, not 0):           {report['missing_energy_values']}")
    print(f"Duplicate (LCLid, tstp) keys:                 {report['duplicate_lclid_tstp_keys']}")
    print(f"Unknown ACORN classifications ('ACORN-'):     {report['unknown_acorn_classifications']}")
    print(f"Timestamp range:                              {report['timestamp_min']} to {report['timestamp_max']}")
    print(f"Joined rows (should equal consumption rows):  {report['joined_rows']}")
    print("=" * 70)


if __name__ == "__main__":
    block_df = load_block()
    households_df = load_households()
    joined_df = build_household_consumption(block_df, households_df)
    report = validate_household_consumption(block_df, households_df, joined_df)
    print_validation_report(report)
