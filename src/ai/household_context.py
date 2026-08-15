"""Builds the structured context for the Energy AI Analyst's household
explanation feature, and owns the fixed system prompt that goes with it.

Unlike ai/anomaly_context.py (which reads results_store's own in-memory
cache directly), the household summary and daily feature tables are handed
in here as already-computed DataFrames. They're built once, at process
startup, by src/api.py's _load_household_data() (household_features.py on
top of household_consumption.py / data/block_0.csv) and held in
_household_cache -- the same tables /api/households/{meter} and
/api/households/{meter}/daily already serve. This function does no I/O and
re-derives nothing; it only selects one meter's rows and shapes them into a
JSON-safe context.

This household sample (block_0.csv, 50 meters) is the same
"household_sample_population" referenced in ai/dashboard_context.py --
entirely separate from the anomaly-scored meter population in
ai/anomaly_context.py / results/anomaly_results.parquet, with no confirmed
overlap. This context never looks a meter up in that other population.
"""

import pandas as pd

# Most recent days of daily-feature history included in the context, so the
# analyst can describe "this household's recent pattern" without being
# handed its entire history.
RECENT_DAILY_DAYS = 30

SYSTEM_PROMPT = """You are the Energy AI Analyst, embedded in an energy-consumption household analytics dashboard.

You will be given a JSON context describing one specific household (meter): its tariff/ACORN classification, its overall consumption summary statistics, and its most recent daily consumption records. This context is the only source of truth you have.

Rules you must follow:
- Use ONLY the facts contained in the supplied context. Never invent numbers, dates, statistics, causes, or classifications that are not present in it.
- Do not perform calculations beyond what is already in the context (e.g. do not compute new percentages, rates, or averages).
- Copy and interpret every number's unit exactly as supplied (consumption figures are in kWh unless stated otherwise; rate/ratio fields are already expressed on their stated scale). Do not infer a different unit from the field name or surrounding text, and do not perform any unit conversion. If you are unsure what unit a value is in, state it exactly as supplied rather than guessing or converting it.
- This household comes from a separate, unrelated sample population from the anomaly-detection results shown elsewhere in this dashboard. You have NOT been given any anomaly-detection data for it here -- never state or imply that this household does or does not have any detected anomalies, and never blend or compare its figures with anomaly-population statistics.
- Explain this household's consumption profile in clear, plain business language a non-technical dashboard user can follow.
- Clearly distinguish observations (what the data shows) from interpretations (what it might mean). Use phrasing like "consistent with" or "relatively high/low compared to its own average" for interpretations -- never state them as fact.
- Never claim a specific cause -- fraud, equipment failure, occupancy changes, or anything else -- as fact unless it is explicitly present in the supplied data. The context given to you never states a cause, so do not assert one.
- If a question cannot be answered from the supplied context, say plainly that the available data does not establish it. Do not guess.
- Stay focused on the selected household. Do not answer questions unrelated to it.
- Keep your response concise: a short paragraph or a few bullet points, useful at a glance on a dashboard.
"""


def _clean_record(record: dict) -> dict:
    """One pandas record dict -> JSON-safe values. pandas Timestamp and NaN
    aren't valid JSON; every other value already is. Same helper as
    ai/anomaly_context.py's, kept local since these are otherwise
    independent modules with no shared base to put it in."""
    cleaned = {}
    for key, value in record.items():
        if isinstance(value, pd.Timestamp):
            cleaned[key] = value.date().isoformat()
        elif pd.isna(value):
            cleaned[key] = None
        else:
            cleaned[key] = value
    return cleaned


def build_household_explanation_context(
    meter: str, household_df: pd.DataFrame, daily_df: pd.DataFrame
) -> dict:
    """Structured, JSON-safe context for one household: its summary record
    plus its most recent RECENT_DAILY_DAYS days of daily consumption features.

    Raises ValueError if no household summary record exists for `meter` --
    same convention as ai/anomaly_context.py / results_store.py, which
    src/api.py already catches to return 404 for the existing endpoints.
    """
    match = household_df.loc[household_df["LCLid"] == meter]
    if match.empty:
        raise ValueError(f"No household found for meter {meter!r}.")
    summary = _clean_record(match.iloc[0].to_dict())

    daily_rows = daily_df.loc[daily_df["LCLid"] == meter].sort_values("date")
    recent_daily = daily_rows.tail(RECENT_DAILY_DAYS)

    return {
        "household_summary": summary,
        "recent_daily_days": RECENT_DAILY_DAYS,
        "recent_daily_consumption": [_clean_record(r) for r in recent_daily.to_dict(orient="records")],
    }
