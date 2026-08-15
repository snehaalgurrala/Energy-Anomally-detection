"""Builds the structured context for the dashboard-level "AI Energy
Intelligence" panel, and owns the fixed system prompt that goes with it.

This is a pure assembly layer: every value it shapes is handed in already
computed by src/api.py, which pulls it straight out of the caches built once
at process startup (_anomaly_cache, _household_cache) -- the same aggregates
already served by /api/summary, /api/anomalies/monthly-trend,
/api/anomalies/segments, /api/anomalies/by-household, and
/api/households/summary. No file is re-read, no DataFrame is re-derived, and
no new metric is computed here.

Two populations are covered, and kept in two separate, separately-labeled
blocks:

  * anomaly_population   -- the full anomaly-scored population
                             (results/anomaly_results.parquet, 1,637 meters).
  * household_sample_population -- the unrelated 50-household consumption
                             sample (data/block_0.csv). See
                             anomaly_segmentation.py's module docstring: this
                             sample has no confirmed overlap with the
                             anomaly-scored population, so its figures must
                             never be presented as describing the anomalies
                             above -- the same reason ai/anomaly_context.py
                             never pulls from household_features.py either.
"""

TOP_HIGH_ANOMALY_HOUSEHOLDS = 5
RECENT_TREND_MONTHS = 6

HOUSEHOLD_SAMPLE_SCOPE_NOTE = (
    "This is a separate 50-meter household consumption-pattern sample "
    "(data/block_0.csv), not the anomaly-scored population above. These "
    "meters have no confirmed overlap with the 1,637 anomaly-scored meters. "
    "Never describe this sample's consumption figures as describing the "
    "anomaly population, and never describe the anomaly population's counts "
    "or rates as describing this sample."
)

SYSTEM_PROMPT = """You are the Energy AI Analyst, embedded in the main dashboard of an energy-consumption anomaly-detection system.

You will be given a JSON context with two independent, separately-labeled blocks:
- "anomaly_population": dataset-wide anomaly detection results (summary counts, a recent monthly trend, a segment-level breakdown, and the top high-anomaly households) for the full anomaly-scored population.
- "household_sample_population": a small, unrelated household consumption-pattern sample, with a "scope_note" field explaining how it relates (or doesn't) to the anomaly population.

This context is the only source of truth you have.

Rules you must follow:
- Use ONLY the facts contained in the supplied context. Never invent numbers, dates, meters, causes, or classifications that are not present in it.
- Do not perform calculations beyond what is already in the context (e.g. do not compute new percentages, rates, or averages).
- The two population blocks describe different, non-overlapping groups of meters. NEVER combine, cross-reference, or blend figures from "household_sample_population" with figures from "anomaly_population" -- do not use one to explain, characterize, or estimate the other. Always attribute each figure to the population it came from.
- Any field whose name ends in `_pct` (e.g. anomaly_rate_pct) is already expressed in percentage points. Never multiply it by 100. If the context contains 0.73 for such a field, describe it as approximately 0.73% -- never as 73%. Copy and interpret every number's unit exactly as supplied; do not infer a different unit from the field name or surrounding text, and do not perform any unit conversion. If you are unsure what unit a value is in, state it exactly as supplied rather than guessing or converting it.
- Explain the dashboard's current state in clear, plain business language a non-technical user can follow.
- Clearly distinguish observations (what the data shows) from interpretations (what it might mean). Use phrasing like "consistent with" or "unusual relative to" for interpretations -- never state them as fact.
- Never claim a specific cause -- fraud, equipment failure, customer behavior, or anything else -- as fact unless it is explicitly present in the supplied data. The context given to you never states a cause, so do not assert one.
- If a question cannot be answered from the supplied context, say plainly that the available data does not establish it. Do not guess.
- Stay focused on the dashboard's data. Do not answer questions unrelated to it.
- Keep your response concise: a short paragraph or a few bullet points, useful at a glance on a dashboard.
"""


def build_dashboard_context(
    summary: dict,
    monthly_trend_rows: list[dict],
    segment_summary: dict,
    top_high_anomaly_households: list[dict],
    household_dataset_summary: dict,
) -> dict:
    """Shape already-computed, already-JSON-safe pieces into the two labeled
    population blocks described in this module's docstring.

    Callers (src/api.py) are responsible for pulling each argument from the
    existing startup caches / query functions and serializing it to plain
    dict/list values first -- this function does no lookups of its own.
    """
    return {
        "anomaly_population": {
            "overall_summary": summary,
            "recent_monthly_trend": monthly_trend_rows[-RECENT_TREND_MONTHS:],
            "segment_summary": segment_summary,
            "top_high_anomaly_households": top_high_anomaly_households[:TOP_HIGH_ANOMALY_HOUSEHOLDS],
        },
        "household_sample_population": {
            "scope_note": HOUSEHOLD_SAMPLE_SCOPE_NOTE,
            "dataset_summary": household_dataset_summary,
        },
    }
