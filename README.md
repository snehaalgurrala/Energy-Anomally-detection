# Energy Consumption Anomaly Detection (POC)

Proof-of-concept for detecting anomalies in energy consumption data.

## Project Structure

```text
├── data/           # Local dataset only — never committed (see .gitignore)
├── src/            # Application/library source code
├── tests/          # Test suite
├── notebooks/       # Exploratory analysis notebooks
├── app/            # Dashboard app (future)
├── requirements.txt
└── .gitignore
```

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Status

Foundation only. Data validation, feature engineering, modeling, and the dashboard are not yet implemented.
