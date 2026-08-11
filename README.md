# Energy Consumption Anomaly Detection (POC)

Proof-of-concept for detecting anomalies in household energy consumption data.

## Dataset

* Working dataset: `data/daily_dataset.csv.xlsx` — local only, never committed (`.gitignore`).
* One row per meter (`LCLid`) per day, with half-hourly-derived aggregates (`energy_mean`, `energy_sum`, `energy_count`, etc.).
* **Known limitation:** the workbook contains exactly 1,048,575 data rows — one below Excel's hard 1,048,576-row worksheet limit — and only 1,637 unique meters. This strongly indicates the source CSV was truncated when saved as `.xlsx` (see investigation in project history). No complete source file exists locally. The POC proceeds on the available data as-is; dataset size, meter list, and date range are **discovered dynamically at runtime** (never hardcoded), so this is a documented coverage limitation rather than a blocker.

## Architecture

```text
Local Dataset (data/daily_dataset.csv.xlsx)
    ↓
Python Data Processing   (load, validate, clean)
    ↓
Feature Engineering      (Python)
    ↓
Anomaly Detection        (Python)
    ↓
Processed Results
    ↓
Python API                (serves processed results only)
    ↓
Next.js / React Dashboard (frontend, calls the API — never reads the raw dataset)
```

* All data handling, feature engineering, anomaly detection, and the API are Python.
* The frontend is Next.js/React (no Streamlit) and only ever consumes results from the Python API — it never loads the raw 1M+ row dataset directly.
* The dataset stays local and gitignored at every stage; only derived/processed results are ever exposed to the frontend.

## Project Structure

```text
├── data/           # Local dataset only — never committed (see .gitignore)
├── src/            # Python: data loading, validation, feature engineering, anomaly detection, API (future)
├── tests/          # Test suite
├── notebooks/      # Exploratory analysis notebooks
├── app/            # Next.js/React dashboard (future) — consumes the Python API only
├── requirements.txt
└── .gitignore
```

Planned (not yet implemented): feature engineering and anomaly-detection modules under `src/`, a thin API layer under `src/` to serve processed results, and the Next.js app scaffolded under `app/`. These will be added when their respective steps begin, not ahead of need.

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Status

Dataset validated and its coverage limitation documented. Feature engineering, anomaly detection, the API, and the dashboard are not yet implemented.
