# Energy Consumption Anomaly Detection — Project Report

**A complete, beginner-friendly, code-verified technical report.**

> **How this report was produced.** Every claim in this document was checked directly against the source code, the local datasets, and the generated results file (`results/anomaly_results.parquet`) as they exist in this repository right now. Numbers were re-computed live from the actual files, not copied from memory or from any older report. Where the code's own docstrings disagree with what the code actually does, the code wins, and the disagreement is called out explicitly. Where something could not be determined from the repository, this document says so in plain words instead of guessing.
>
> **A documentation discrepancy found during this review, stated up front:** the project's own `README.md` says *"Feature engineering, anomaly detection, the API, and the dashboard are not yet implemented."* This is **out of date**. All of these are fully implemented: `src/feature_engineering.py`, `src/statistical_detector.py`, `src/isolation_forest_detector.py`, `src/hybrid_detector.py`, `src/pipeline.py`, `src/api.py`, and a complete Next.js dashboard in `frontend/` all exist and work together end-to-end, backed by a generated results file with real anomaly counts. This report describes the project **as it actually is**, not as the README describes it.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Complete End-to-End Architecture](#2-complete-end-to-end-architecture)
3. [The Datasets, Explained Deeply](#3-the-datasets-explained-deeply)
4. [Data Validation](#4-data-validation)
5. [Feature Engineering](#5-feature-engineering)
6. [The Statistical Anomaly Detector](#6-the-statistical-anomaly-detector)
7. [Isolation Forest](#7-isolation-forest)
8. [Why Two Detectors?](#8-why-two-detectors)
9. [Why Not Other ML Algorithms?](#9-why-not-other-ml-algorithms)
10. [The Hybrid Anomaly Detector](#10-the-hybrid-anomaly-detector)
11. [Spike/Drop Decision Logic](#11-spikedrop-decision-logic)
12. [Where Is Machine Learning Actually Used?](#12-where-is-machine-learning-actually-used)
13. [Where Is AI Actually Used?](#13-where-is-ai-actually-used)
14. [Statistics vs. Machine Learning vs. AI](#14-statistics-vs-machine-learning-vs-ai)
15. [Why This Is a Proof of Concept (POC)](#15-why-this-is-a-proof-of-concept-poc)
16. [Backend Architecture, File by File](#16-backend-architecture-file-by-file)
17. [Frontend Architecture](#17-frontend-architecture)
18. [API Architecture](#18-api-architecture)
19. [Results and Validation](#19-results-and-validation)
20. [Performance](#20-performance)
21. [Limitations](#21-limitations)
22. [End-to-End Walkthroughs](#22-end-to-end-walkthroughs)
23. [Why Each Technology Exists](#23-why-each-technology-exists)
24. [Explain This Project to Me in 5 Minutes](#24-explain-this-project-to-me-in-5-minutes)

---

## 1. What Is This Project?

### 1.1 The problem, in plain language

Electricity companies and smart-meter operators collect huge amounts of consumption data — every household's meter reports how much electricity it used, over and over, every day, for years. Buried in that mountain of numbers are days where a household's electricity usage looks *strange* compared to how that same household normally behaves: a sudden huge spike, or a day where usage collapses to almost nothing when it never has before.

Those strange days matter, because they can be early evidence of things a utility company cares about: a faulty meter, a heating/cooling system stuck on, a vacant property still billing, a possible tampering or theft situation, or simply a household whose behavior has genuinely changed. Finding them by manually staring at millions of rows of numbers is not realistic — this project builds an automated pipeline that reads a household energy dataset, learns what "normal" looks like for *each individual meter*, and flags the days that don't fit.

### 1.2 Key vocabulary (defined once, used throughout)

| Term | Meaning in this project |
|---|---|
| **Meter** | A physical electricity meter attached to one household. Identified in the data by a code such as `MAC000131`. |
| **`LCLid`** | "London Low Carbon London id" — the column name used in this dataset (which originates from the UK Low Carbon London smart-meter trial) to identify a meter/household. Functionally, it is the meter's unique ID. |
| **Energy-consumption record** | One row of data describing how much electricity one meter used over some period (a half-hour, or a whole day, depending on which file). |
| **Anomaly** | A day where a meter's consumption looks statistically unusual *compared to that same meter's own recent history* — not compared to other households. |
| **Baseline** | What "normal" looks like for a specific meter, computed from its own trailing history (this project uses the meter's own previous 7 days). |
| **Spike** | An anomaly where consumption is unusually *higher* than the meter's own baseline. |
| **Drop** | An anomaly where consumption is unusually *lower* than the meter's own baseline (including collapsing to zero). |

### 1.3 Why "compared to its own history" and not "compared to other meters"

A raw kWh (kilowatt-hour) reading, by itself, tells you almost nothing about whether something is wrong. A household with an electric heating system and a large family might legitimately use 60 kWh in a day; a single-occupant flat might legitimately use 2 kWh. Comparing those two numbers directly and calling the larger one "anomalous" would just be re-discovering which households are big consumers — not finding anything actually unusual.

What *is* informative is comparing a meter's consumption **today** to how that **same meter** has behaved over roughly the last week. If a household that normally uses ~10 kWh/day suddenly uses 60 kWh, or suddenly uses 0, that is meaningful regardless of whether 10 kWh or 60 kWh is "big" in some absolute sense. This is the central design decision behind every detector in this project: everything is scored **meter-relative**, never in raw absolute kWh terms.

### 1.4 Business objective vs. technical objective

- **Business objective:** give an energy analyst a short, ranked list of "household X, on day Y, did something unusual" events, with enough context (how unusual, in which direction, and a plain-language explanation) to decide whether it's worth investigating — without them having to look at the full multi-million-row dataset themselves.
- **Technical objective:** build a deterministic, explainable, meter-aware anomaly-scoring pipeline over a static local dataset, expose the results through a queryable API, and present them in a web dashboard, adding a natural-language explanation layer on top of (not instead of) the numerical detection.

### 1.5 What this POC demonstrates — and what it deliberately does not do

This is important to state precisely, because the terms below are often used loosely.

| Capability | Does this project do it? | Where in the code |
|---|---|---|
| **Energy monitoring** — recording/aggregating consumption over time | Yes | The daily/half-hourly aggregate files themselves, plus `household_features.py`'s daily/monthly aggregations |
| **Anomaly detection** — flagging unusual days relative to a meter's own history | **Yes — this is the core of the project** | `statistical_detector.py`, `isolation_forest_detector.py`, `hybrid_detector.py` |
| **Forecasting** — predicting *future* consumption | **No.** No model in this codebase predicts a future value. | Not present anywhere in `src/` |
| **Classification** in the supervised-ML sense (learning from labeled examples of "anomaly" vs. "normal") | **No.** There are no ground-truth anomaly labels anywhere in the datasets. Both detectors are unsupervised/statistical. | Confirmed by inspecting every detector module — none fits a model against a labeled target |
| **Root-cause analysis** — determining *why* an anomaly happened (faulty meter? vacancy? theft?) | **No.** The system reports *that* and *how much* a reading deviated, never *why*. The AI layer is explicitly instructed never to assert a cause (see [Section 13](#13-where-is-ai-actually-used)). | `src/ai/anomaly_context.py`'s system prompt |
| **AI-assisted explanation** — turning detection output into plain-language text | Yes, as a layer *on top of* detection, never as detection itself | `src/ai/*.py`, the `/api/ai/*` endpoints |

The single most important sentence in this section: **this project detects statistically unusual consumption; it does not explain why the anomaly happened, and it does not predict the future.**

---

## 2. Complete End-to-End Architecture

### 2.1 The real architecture (verified against the code)

The project actually has **two parallel data domains** that are mostly independent, plus one module that bridges them. This is more than the simple single-pipeline diagram a first glance might suggest, so it is drawn out fully below.

**Domain A — the anomaly-detection pipeline** (the heart of the project, built on `data/daily_dataset.csv.xlsx`):

```text
data/daily_dataset.csv.xlsx  (1,048,575 rows, 1,637 meters, one row per meter per day)
        │
        ▼
src/data_validation.py        — load + profile the dataset (no cleaning/mutation)
        │
        ▼
src/feature_engineering.py    — calendar features, completeness flags,
        │                        meter-relative lag/rolling-baseline features
        ▼
   ┌───────────────────────────────┬────────────────────────────────┐
   ▼                                                                 ▼
src/statistical_detector.py                          src/isolation_forest_detector.py
(robust z-score vs. meter's own                       (unsupervised IsolationForest on
 trailing 7-day median/MAD baseline)                    meter-relative ratio features)
   │                                                                 │
   └──────────────────────────┬──────────────────────────────────────┘
                                ▼
                     src/hybrid_detector.py
           (percentile-rank-normalizes both scores, averages them
            50/50, applies a threshold, plus a severe-drop override)
                                │
                                ▼
                        src/pipeline.py
          (orchestrates the whole chain, times each stage,
           runs a determinism check, saves the final table)
                                │
                                ▼
              results/anomaly_results.parquet   (1,048,575 rows, 15 columns)
                                │
                                ▼
                        src/results_store.py
        (loads the Parquet file once into memory, serves filtered/
         sorted/paginated queries — never re-reads or re-scores)
                                │
                                ▼
                          src/api.py  (FastAPI)
                                │
                                ▼
                  frontend/ (Next.js/React dashboard)
                                │
                                ▼
              src/ai/*.py  →  OpenRouter LLM  →  "AI Analyst" text
```

**Domain B — the household consumption/analytics layer** (built on the *separate* `data/block_0.csv` + `data/informations_households.csv` files, which cover a **different, smaller, 50-meter sample** with **no confirmed overlap** with the 1,637 meters scored in Domain A — the project's own code comments state this explicitly):

```text
data/block_0.csv (1,222,670 half-hourly readings, 50 meters)
data/informations_households.csv (5,566 metadata rows: tariff, ACORN classification)
        │
        ▼
src/household_consumption.py   — load + left-join consumption to metadata on LCLid
        │
        ▼
src/household_features.py      — half-hourly → daily → per-household summary tables
        │                         (time-of-day windows, weekday/weekend, completeness)
        ▼
                served by the /api/households/* endpoints in src/api.py
                                │
                                ▼
                  frontend/app/households/* pages
```

**The bridge — `src/anomaly_segmentation.py`:** the only module that joins Domain A's results with Domain B's metadata source. It does **not** join to Domain B's 50-meter consumption sample; it joins the anomaly results to the *full* `informations_households.csv` metadata file (5,566 rows) on `LCLid`, to answer "do anomaly rates differ by ACORN group or tariff type?" This produces the `/api/anomalies/segments` endpoint and the segment charts on the Anomalies page.

### 2.2 Why this two-domain structure matters

The prescriptive diagram many anomaly-detection write-ups use (`Dataset → Validation → Features → Statistical → IF → Hybrid → Results → API → Dashboard → AI`) is **correct for Domain A**, and this project follows it faithfully. But this codebase also contains a second, materially different analytics layer over a different dataset that is *not* part of anomaly detection at all — it's plain descriptive analytics (averages, medians, weekday/weekend ratios). Conflating the two would misrepresent the project, so this report keeps them clearly separated throughout, exactly as the code itself does (`ai/anomaly_context.py`'s docstring: *"household_features.py is deliberately not used here: it's built from block_0.csv's 50-household sample, which has zero overlap with the anomaly-scored meter population"*).

### 2.3 ML/Data architecture vs. Application architecture

**Data / ML architecture** (Domain A, the anomaly logic itself) — pure Python, pandas, NumPy, scikit-learn. No web framework, no HTTP, nothing here knows an API or a browser exists. Every module can be run standalone from the command line and prints its own validation report.

**Application architecture** — FastAPI (`src/api.py`) reads only the *already-computed* Parquet results and the *already-computed* household feature tables; it contains zero detection logic. The Next.js frontend (`frontend/`) never touches the dataset or the ML code at all — it only ever calls the FastAPI HTTP endpoints. This separation is enforced by directory structure, not just convention: the frontend has no Python dependency and no filesystem access to `data/` or `results/`.

### 2.4 What each stage is, why it exists, and what breaks without it

| Stage | What goes in | What comes out | Why it exists | If removed |
|---|---|---|---|---|
| `data_validation.py` | Raw Excel file | A validated, typed DataFrame + a data-quality report | Establishes ground truth about the data's shape, gaps, and quirks before anything else trusts it | Every downstream stage would silently assume clean data it doesn't have |
| `feature_engineering.py` | Validated DataFrame | A feature table with calendar, completeness, and meter-relative history columns | Both detectors need a *baseline* to compare today against — raw rows have no notion of "this meter's normal" | Neither detector could compute a meaningful score; there would be nothing to compare "today" to |
| `statistical_detector.py` | Feature table | Per-row robust z-score + boolean flag | A transparent, explainable, formula-based detector that works even with almost no historical data per meter | The project would lose its only fully interpretable signal and its only reliable way to catch severe drops |
| `isolation_forest_detector.py` | Feature table | Per-row anomaly score + boolean flag | A second, independent signal that can catch shapes of anomaly the formula-based detector isn't built to see | The system would rely on a single detector with a single blind spot |
| `hybrid_detector.py` | Both detectors' outputs | One combined score + final Spike/Drop/Normal decision | Neither individual detector alone was judged sufficient (see [Section 8](#8-why-two-detectors)) | The dashboard would have to show two separate, harder-to-reconcile anomaly lists instead of one |
| `pipeline.py` | Everything above | `results/anomaly_results.parquet` | Runs the whole chain once, deterministically, and persists it so the API doesn't recompute on every request | Every API request would have to re-run the entire ML pipeline, which is far too slow for a web request |
| `results_store.py` | Parquet file | In-memory cached DataFrame + query functions | Keeps the API fast by loading the (already small) results once, not per-request | Every API call would re-read the Parquet file from disk |
| `api.py` | Query functions | JSON over HTTP | The only thing the frontend is allowed to talk to | The frontend would need direct Python/pandas access, defeating the whole point of a web architecture |
| `frontend/` | JSON from the API | A rendered dashboard in the browser | Human-usable presentation layer | The project would be unusable by a non-technical analyst |
| `src/ai/*.py` + OpenRouter | Structured JSON context about a specific anomaly/household/dashboard state | Plain-language text | Converts numeric detection output into something a non-technical stakeholder can read at a glance | The dashboard would still show every number, just with no natural-language narrative on top |

---

## 3. The Datasets, Explained Deeply

Three local dataset files exist under `data/`. **None of them is committed to the git repository** (`.gitignore` excludes `data/*` while keeping the folder itself present via `data/.gitkeep`) — they must be supplied locally.

### 3.1 `data/daily_dataset.csv.xlsx` — the anomaly-detection dataset

Despite its name (which suggests a CSV), this file is stored as an actual Excel workbook (`.xlsx`) and is loaded with `pandas.read_excel(..., engine="openpyxl")`.

**Measured, not assumed, from the file itself:**

- **Shape:** 1,048,575 rows × 9 columns.
- **Unique meters (`LCLid`):** 1,637.
- **Date range:** 2011-11-23 to 2014-02-28.
- **One row = one meter, on one calendar day**, summarizing that meter's electricity use for that day.

**Known limitation, confirmed and preserved from the project's own README:** 1,048,575 is exactly one row below Excel's hard worksheet limit of 1,048,576 rows. This strongly suggests the original CSV source was truncated when it was saved into `.xlsx` format, and that a complete source file does not exist locally. The project does not attempt to work around this — it proceeds on the data as-is, and (per `data_validation.py`) discovers the actual row count, meter count, and date range dynamically at runtime rather than hardcoding any of them, so the pipeline is not silently wrong if the underlying file changes.

**Column-by-column reference:**

| Column | Type | Meaning | Used by ML pipeline? | Stage that uses it | What would be lost if removed |
|---|---|---|---|---|---|
| `LCLid` | string (e.g. `MAC000131`) | The meter/household identifier | Yes — every stage | All (it is the grouping key for "this meter's own history") | No way to distinguish one household's history from another's; meter-relative baselining would be impossible |
| `day` | datetime | The calendar date this row summarizes | Yes — every stage | All (ordering, lag/rolling windows, calendar features) | No way to establish "yesterday" vs "today" or compute trends |
| `energy_sum` | float (kWh) | Total energy consumed by this meter on this day (sum of that day's half-hourly readings) | Yes — this is the **primary consumption signal** the entire pipeline is built around | Feature engineering, both detectors | The whole detection system has no consumption number left to score |
| `energy_mean` | float (kWh) | Average of the half-hourly readings that day | Carried through to the feature table but **not used by either detector's scoring math** | `feature_engineering.py` copies it through | No effect on detection; some potential context is lost |
| `energy_median` | float (kWh) | Median of the half-hourly readings that day | **Not used anywhere in the pipeline** — present in `data_validation.py`'s profiling only | `data_validation.py` (profiling/statistics only) | No effect — this column plays no role beyond the validation report |
| `energy_max` | float (kWh) | Highest single half-hourly reading that day | Carried through to the feature table, used for basic sanity checks in validation (e.g. "is min > max?") | `feature_engineering.py`, `data_validation.py` | No effect on the anomaly scores; loses a sanity-check signal |
| `energy_min` | float (kWh) | Lowest single half-hourly reading that day | Carried through to the feature table; used in validation sanity checks | `feature_engineering.py`, `data_validation.py` | Same as above |
| `energy_std` | float (kWh) | Standard deviation of that day's half-hourly readings (**within-day** volatility) | Carried through to the feature table, **not used by either detector's scoring math** (the detectors use `rolling_7d_mad`, a **between-day** volatility measure computed later — see [Section 5](#5-feature-engineering) — which is a different statistic entirely) | `feature_engineering.py` copies it through | No effect on detection |
| `energy_count` | integer | How many of the day's (up to 48) half-hourly readings were actually present | **Yes — critical.** Drives the `is_complete_day` flag that both detectors depend on | `feature_engineering.py`, both detectors' eligibility logic | Without it, there would be no way to tell a genuinely low-consumption day from a day where most readings are simply missing — this is one of the most important columns in the whole dataset |

**On `energy_sum` vs. `energy_mean` vs. `energy_median` vs. `energy_min`/`energy_max`/`energy_std`/`energy_count`:**

- `energy_sum` answers *"how much total electricity did this meter use today?"* — the number that actually matters for billing, for spotting a spike, or for spotting a day that used almost nothing.
- `energy_mean` and `energy_median` both answer *"what was a typical half-hour like today?"* — `energy_mean` is sensitive to a single unusually large half-hour reading; `energy_median` is not.
- `energy_min`/`energy_max` answer *"what were the extremes within today?"* — useful for spotting a single freak reading within an otherwise normal day, though the pipeline does not currently score on this.
- `energy_std` answers *"how variable was usage within today?"* — again, a different question from "how variable has this meter been across recent days?", which is what the detectors actually use.
- `energy_count` answers *"how much of today do we actually have data for?"* — it is not a consumption measure at all, it is a **data-completeness** measure, and it turns out to be one of the two or three most important columns in the dataset for keeping the anomaly detector honest.

**Why daily aggregates are useful for this POC:** working at daily granularity (rather than half-hourly) keeps the row count manageable (~1M rows instead of ~50M), matches how a human analyst naturally thinks about "did something unusual happen on this day", and is the level at which the source dataset happens to already be aggregated — the raw half-hourly data for this population was not available locally (only a 50-meter sample of it, in `block_0.csv`, exists).

**The 48-readings-per-day concept:** `data_validation.py` defines `EXPECTED_DAILY_READINGS = 48` in code — the correct value for half-hourly meter readings (24 hours × 2 readings/hour = 48). This is confirmed as the modal/expected value directly from the data: the measured `energy_count` distribution has its 25th, 50th, and 75th percentiles all sitting exactly at 48, i.e. a complete day is not just expected in theory, it is what the great majority of real rows actually have.

**Missing data, incomplete days, zero-reading days, and calendar gaps — precisely, not vaguely:**

1. **Incomplete days** (`energy_count < 48`, i.e. some half-hourly readings for that day are missing): confirmed present in the data (e.g. the profiling script's incomplete-day histogram shows counts scattered across many values below 48). The pipeline's answer is **not** "fill in the missing readings" or "down-weight the day" — it is to **exclude incomplete days from being scored at all**, while still keeping the row in the output with `is_complete_day = False` and `eligibility_status = "incomplete_day"` so the row remains visible, just not treated as evidence of an anomaly. The reasoning, taken directly from `statistical_detector.py`'s own validation findings: a partial day's `energy_sum` is *structurally* smaller than a full day's, because it is summing fewer readings — scoring it against a full-day baseline would manufacture false "unusually low consumption" anomalies purely as an artifact of missing data, not real behavior. The code's own measured evidence for this: mean deviation from baseline is **-3.04** on incomplete days vs. **+0.24** on complete days — a systematic downward bias, not random noise.
2. **Zero-reading days** (`energy_count == 0`, i.e. an entire day where nothing was recorded at all): 10 such rows were measured directly in the raw file. These are **not** treated as "zero consumption" — they fall into the same "incomplete day" exclusion above (`energy_count != 48` covers `energy_count == 0` too), because a day with zero *readings* is a data-collection gap, not evidence that the meter used zero electricity.
3. **Calendar gaps** (a meter simply has no row at all for some date, rather than a row with a low count): handled at the feature-engineering stage by reindexing each meter onto a complete daily calendar before computing any lag/rolling feature — see [Section 5.5](#55-why-the-project-reindexes-each-meter-to-a-full-calendar) for exactly how and why.

Two more counts confirmed directly from the file, kept precise rather than described loosely: rows with `energy_count == 1` number 3,372 (a large group of near-empty days sitting apart from the "mostly complete" bulk of the distribution) — these too fall under the same incomplete-day exclusion.

### 3.2 `data/block_0.csv` — raw half-hourly consumption (a different, smaller sample)

**Measured directly:** 1,222,670 rows × 3 columns (`LCLid`, `tstp`, `energy(kWh/hh)`). 50 unique meters. One row = one meter's electricity reading for one 30-minute interval.

This is **not** an input to the anomaly-detection pipeline (Domain A). It feeds a separate descriptive-analytics layer (Domain B: `household_consumption.py` → `household_features.py`) that powers the `/households` pages of the dashboard. It is a genuinely different, much smaller population of meters than the 1,637 meters scored for anomalies — the project's own code explicitly documents that there is **no confirmed overlap** between the two populations, and treats them as two separate "populations" throughout (including in what is shown to the AI layer — see [Section 13](#13-where-is-ai-actually-used)).

Known data-quality facts about this file, documented in `household_consumption.py`'s module docstring and reproducible from the loader: roughly 50 null `energy(kWh/hh)` readings (preserved as `NaN`, never coerced to `0`), and roughly 272 non-standard (irregular) timestamp intervals out of ~1.22M consecutive half-hourly readings (preserved as-is, no resampling or gap-filling is performed).

### 3.3 `data/informations_households.csv` — household metadata

**Measured directly:** 5,566 rows × 5 columns: `LCLid`, `stdorToU` (tariff type: standard flat-rate `"Std"` or time-of-use `"ToU"`), `Acorn` (a detailed UK consumer-classification code, e.g. `ACORN-A`), `Acorn_grouped` (a coarser grouping, e.g. `"Affluent"`, `"Comfortable"`, `"Adversity"`, or the special values `"ACORN-"`/`"ACORN-U"` described below), and `file` (which source batch the row came from — explicitly excluded from analysis in `household_consumption.py` because it describes provenance, not a property of the household).

This file is the metadata used in two different ways by two different parts of the project: (a) joined to the 50-meter `block_0.csv` sample by `household_consumption.py` to build the household-analytics tables, and (b) joined to the **1,637-meter anomaly results** by `anomaly_segmentation.py` to build the ACORN/tariff segment breakdown shown on the Anomalies page. Two households in the file carry `Acorn == "ACORN-"`, a sentinel meaning "no ACORN classification available" — distinct from `Acorn_grouped == "ACORN-U"`, which is a real, defined classification ("Unclassified"), not a missing value. Both are preserved as-is, never dropped or relabeled.

---

## 4. Data Validation

`src/data_validation.py` is the first stage of the pipeline and the only module responsible for establishing what the raw dataset actually looks like before anything trusts it.

**What it actually does**, function by function:

- `load_dataset()` — reads the Excel file and parses `day` into a real datetime column. It performs **no cleaning, filling, or dropping** — this is a load step, not a cleaning step.
- `profile_dataset()` — computes: overall shape and dtypes; missing values per column; duplicate rows and duplicate `(LCLid, day)` key pairs; number of unique meters and the overall date range; the distribution of how many records each meter has and how many meters are present per date; the full distribution of `energy_count` and how many rows are "complete" (`== 48`) vs. not; descriptive statistics for every `energy_*` column; and several targeted sanity checks — negative values in any energy column, rows where `energy_count > 48` (should never happen), rows where `energy_min > energy_max` (a logical impossibility), and rows where `energy_mean` falls outside `[energy_min, energy_max]` (also a logical impossibility).
- `sample_meter_timelines()` — for a few representative meters (first, middle, last by ID), reports how many records they have, their first/last day, how many days that *should* span, and how many calendar gaps (`non_daily_gap_count`) exist in their timeline.

**Why validation has to happen before any ML/statistics step:** every later stage makes assumptions about the data that would otherwise be silent and unverified — that `LCLid` + `day` uniquely identifies a row, that `energy_count` reliably indicates completeness, that dates parse correctly, that there are no impossible values like `energy_min > energy_max`. If any of those assumptions were false and nobody checked, the anomaly detectors would not "fail loudly" — they would silently produce wrong scores that *look* plausible.

**Why data quality is especially dangerous for anomaly detection specifically:** an anomaly detector's entire job is to notice when something looks different from normal. A data-quality problem — a missing reading, a partial day, a meter that stops reporting for a while — *also* looks different from normal, in exactly the same statistical sense a real behavioral anomaly does. If the pipeline did not distinguish "this day is really unusual" from "this day just has bad/missing data," it would systematically misreport data-collection problems as household-behavior anomalies. This is precisely why `energy_count` (a data-quality signal) is elevated to a first-class eligibility gate in both detectors, not folded in as just another feature — see the `incomplete_day` handling in [Section 6](#6-the-statistical-anomaly-detector).

---

## 5. Feature Engineering

### 5.1 What is a "feature", and why can't the raw dataset just be fed to a detector?

A **feature** is a single, well-defined number (or category) computed from the data that is meant to carry a specific piece of meaning a model or formula can use. **Feature engineering** is the process of deriving those numbers from raw data.

The raw dataset has one row per meter per day with a handful of *that day's own* statistics. But every detector in this project needs to answer a *relative* question: **"is today's consumption unusual for this specific meter, given what this meter's own recent history looks like?"** Nothing in the raw row can answer that — a raw row has no memory of yesterday, last week, or this meter's normal pattern. Feature engineering is the step that manufactures that memory: it looks across each meter's own timeline and computes, for every day, what its own recent baseline was.

### 5.2 Every feature actually built by `src/feature_engineering.py`

**Calendar features** (derived directly from the `day` column):

| Feature | Logic | Why it exists |
|---|---|---|
| `day_of_week` | `day.dt.dayofweek` (0=Monday..6=Sunday) | Basic calendar context |
| `month` | `day.dt.month` | Basic calendar context |
| `is_weekend` | `day_of_week` in `{5, 6}` | Weekday/weekend consumption patterns can differ; kept available as context |

*(Note on scope: these calendar features are computed and carried in the feature table, but neither the statistical detector nor the Isolation Forest detector's final feature set actually consumes `day_of_week`/`month`/`is_weekend` in its scoring math. `isolation_forest_detector.py`'s own module docstring documents that adding `day_of_week`/`is_weekend` to the Isolation Forest features was explicitly tested and rejected — see [Section 7.6](#76-why-the-project-moved-away-from-raw-kwh-features).)*

**Consumption features** (carried through unchanged from the source row, one important caveat below):

| Feature | Logic | Why it exists |
|---|---|---|
| `energy_sum`, `energy_mean`, `energy_std`, `energy_min`, `energy_max` | Copied as-is from the source row | Kept available in the feature table for context and for the detectors that need `energy_sum` specifically |

Note: because a day with `energy_count == 0` has no readings, its `energy_sum` etc. are `NaN` in the source file — this propagates through unchanged; nothing invents a `0` in its place.

**Completeness features:**

| Feature | Logic | Why it exists |
|---|---|---|
| `energy_count` | Copied from source | The raw completeness signal |
| `is_complete_day` | `energy_count == 48` | The boolean gate both detectors use to exclude partial days from scoring |

**Historical / meter-relative features** (the heart of the feature-engineering module, computed by the internal `_history_features()` function on a specially constructed *calendar-complete* grid — explained in 5.5 below):

| Feature | Formula | Meaning |
|---|---|---|
| `previous_day_energy_sum` | `energy_sum` shifted by 1 day within each meter (`shift(1)` on the calendar-complete series) | Yesterday's total consumption for this meter |
| `pct_change_1d` | `(energy_sum − previous_day_energy_sum) / previous_day_energy_sum`, only when the denominator is defined and non-zero, else `NaN` | Day-over-day percent change |
| `pct_change_7d` | Same formula, but against the value 7 days back (`shift(7)`) | Week-over-week percent change |
| `rolling_7d_median` | Median of the *previous* 7 days' `energy_sum` (i.e. of `previous_day_energy_sum`'s own trailing 7-day window) | The meter's own recent "typical day" baseline |
| `rolling_7d_mad` | Median Absolute Deviation of that same trailing 7-day window | The meter's own recent day-to-day variability, measured robustly (see [Section 6](#6-the-statistical-anomaly-detector) for exactly what MAD means) |
| `deviation_from_rolling_median` | `energy_sum − rolling_7d_median` | Today's raw deviation from this meter's own baseline |
| `days_since_previous_record` | Calendar-day gap between this row and this meter's previous *real* row | Flags calendar gaps directly |

**Important, and explicitly stated by the code itself:** `pct_change_1d` and `pct_change_7d` are computed and kept in the feature table, but **neither detector uses them for scoring**. `statistical_detector.py`'s own docstring explains exactly why: they divide by a *single day's* raw reading, and roughly 0.5% of rows have a near-zero previous-day reading, which turns an otherwise small absolute change into a percentage change of thousands of percent — a number that is technically correct but statistically meaningless as a measure of "how big was this change." Both detectors instead use denominators built from a **7-day median**, which is far more resistant to a single unlucky near-zero day (see 5.4 and 6.3 below).

### 5.3 Rolling windows, medians, and MAD — defined for a reader who has never seen these terms

- A **rolling window** is a "moving slice" of the most recent N data points as you walk forward through time — e.g. "the 7 days ending yesterday." As the current day advances, the window shifts forward with it.
- The **median** of a set of numbers is the middle value when they are sorted — unlike the mean (average), a single very large or very small number in the set cannot pull the median far from the bulk of the data. This matters a lot here: a single freak spike day, if it ever entered a baseline window, would badly distort a mean-based baseline but barely move a median-based one.
- **MAD (Median Absolute Deviation)** measures how spread out a set of numbers is, the same way standard deviation does, but robustly: take the median, then take the median of *how far each point is from that median*. Full explanation with a worked example is in [Section 6](#6-the-statistical-anomaly-detector).
- Together, "median + MAD of the trailing 7 days" gives a **robust baseline** (typical level) and a **robust measure of normal variability** for a specific meter, both resistant to being thrown off by one bad or unusual day.

### 5.4 Why the previous 7 days, and never today — future leakage, explained concretely

**Future leakage** (also called "data leakage") happens when information from the future — including, most subtly, information from the very thing you're trying to evaluate — sneaks into a calculation that's supposed to represent "what we knew/expected beforehand." If today's own value is allowed to influence today's own baseline, the baseline is no longer an honest "what was normal before this happened" — it's contaminated by the very event you're trying to judge.

Concrete example, exactly matching how this project computes it:

> **Day 8** is the day being scored.
> The baseline for Day 8 must be built **only** from **Days 1–7**.
> If Day 8 were allowed to leak into its own baseline (say, by including it in an 8-day rolling window), then a massive spike on Day 8 would inflate the very median/MAD being used to judge whether Day 8 is unusual — making a real anomaly look artificially more "normal" by baking the anomaly into its own yardstick.

The code enforces this mechanically, not just by convention: `feature_engineering.py`'s `_history_features()` first computes `previous_1d = grouped["energy_sum"].shift(1)` — i.e., a series that, on any given row, holds *yesterday's* value — and then computes the rolling 7-day median/MAD **on that already-shifted series**. This means the window used for "today's" baseline is mechanically Days t-7 through t-1, never including day t. The project also includes an explicit automated check for this: `_check_no_future_leakage()` deliberately corrupts one late-history day for a real meter (adding 1,000,000 to its `energy_sum`) and re-builds the features, then asserts that **every earlier row's** features are byte-for-byte unchanged. If a future value ever leaked backward into an earlier row's baseline, this test would fail. This check runs automatically every time `feature_engineering.py` is executed directly.

### 5.5 Why the project reindexes each meter to a full calendar

A naive `groupby("LCLid")["energy_sum"].shift(1)` computes "the previous *row*," not "the previous *calendar day*." If a meter has a **calendar gap** — say it has rows for Jan 1, Jan 2, then nothing until Jan 10 — a naive `shift(1)` would treat Jan 2's value as "yesterday" relative to Jan 10, silently bridging an 8-day hole as if it were a normal one-day step. This would make a rolling baseline look like it reflects "the last 7 days" when it might actually span several weeks of real calendar time, contaminated by data from a period that isn't actually recent.

The project's fix, in `_build_daily_calendar()`: before computing any lag/rolling feature, it builds a **complete daily calendar per meter**, spanning that meter's own first-to-last observed day, and inserts a row (with `energy_sum = NaN`) for every date the meter is missing from the source data. Only *after* this reindexing does it compute `shift(1)`, `shift(7)`, and the rolling median/MAD. Because the strict rolling-window logic (`_rolling_median_mad`) requires **all 7 slots in a window to be non-null** (`min_periods == window`, not a looser fallback), a single missing day inside a 7-day window makes every window touching it come out `NaN` rather than silently computing an average over fewer than 7 real days. This is a deliberate "fail to NaN, don't quietly under-count" choice — the resulting `NaN` propagates into `eligibility_status = "gap_in_history"` (see [Section 6](#6-the-statistical-anomaly-detector)), which keeps the row visible in the final output but excluded from being scored.

---

## 6. The Statistical Anomaly Detector

`src/statistical_detector.py` is the project's first, formula-based detector. It contains no machine learning — it is a fully transparent statistical calculation that anyone can hand-verify with a calculator.

### 6.1 What "anomaly detection" means mathematically, at its simplest

At its core, this detector asks one question per row: *"how many baseline 'typical variability units' away from this meter's own normal is today's value?"* A small answer means today looks like a normal day for this meter; a large answer (in either direction) means today looks unusual.

### 6.2 The formula, piece by piece

```text
robust_score = 0.6745 × deviation_from_rolling_median / rolling_7d_mad
```

- **`deviation_from_rolling_median`** — today's raw distance from the meter's own baseline: `energy_sum − rolling_7d_median` (computed in feature engineering, [Section 5](#5-feature-engineering)).
- **`rolling_7d_mad`** — the meter's own recent variability (Median Absolute Deviation over the trailing 7 days, defined below).
- **`0.6745`** — a fixed scaling constant, mathematically equal to `Φ⁻¹(0.75)` (the 75th percentile of the standard normal distribution). Its purpose: MAD, on its own, is a smaller number than the standard deviation of the same data would be. Multiplying by 0.6745 rescales MAD so that this "modified z-score" ends up in roughly the same numeric range as a familiar mean/standard-deviation z-score (where "±2" or "±3" are intuitively recognizable as "notably unusual"). This is a widely used statistical convention, not something invented for this project.
- **Numerator vs. denominator:** the numerator (`deviation_from_rolling_median`) says *how far* today is from normal, in raw kWh. The denominator (`rolling_7d_mad`) says *how much day-to-day wobble is normal* for this specific meter recently. Dividing the two converts "kWh of deviation" into "how many normal-wobbles away," which is comparable across meters with completely different absolute consumption levels — a low-consumption meter's small kWh swings and a high-consumption meter's large kWh swings can both register as "3 units away from normal" if that's what they each are, relatively.

### 6.3 Why median instead of mean, and MAD instead of standard deviation — robustness, explained

Both the mean and the standard deviation are sensitive to outliers: one freak value in a small window can drag the mean far from where "most" of the data actually sits, and can inflate the standard deviation, making the detector both mis-centered and artificially insensitive right after the anomaly it should have caught. **Robust statistics** — median and MAD — are specifically designed to resist this: the median only cares about the middle-ranked value, and MAD only cares about the median of the *absolute distances* from that median, so a single wild value in a 7-day window has limited power to distort either one.

This matters concretely for a rolling 7-day baseline, which is short by design (so it stays *recent*) — with only 7 points, a mean/standard-deviation baseline would be badly distorted by even one unusual day inside the window, right when you'd want the baseline to stay stable enough to detect the *next* anomaly clearly.

### 6.4 A full worked numerical example

Suppose a meter's previous 7 days of `energy_sum` were: **10, 11, 10, 12, 11, 10, 11** (kWh), and today's value is **25** kWh.

1. **Median of the 7 days:** sorted, `[10, 10, 10, 11, 11, 11, 12]` → the middle (4th) value is **11**. This is `rolling_7d_median`.
2. **MAD:** absolute distance of each of the 7 values from 11: `[1, 0, 1, 1, 0, 1, 0]` → sorted `[0, 0, 0, 1, 1, 1, 1]` → the median of those is **0** ... but hold on — with an odd count of 7, the 4th sorted value is `1`. So `rolling_7d_mad = 1`.
3. **Deviation:** `deviation_from_rolling_median = 25 − 11 = 14`.
4. **Robust score:** `0.6745 × 14 / 1 = 9.443`.
5. **Interpretation:** a score of roughly 9.4 is a very large modified z-score — far beyond the kind of day-to-day wobble (±1 kWh) this meter has shown recently. This would be flagged as a strong Spike.

### 6.5 Edge cases — exactly how the code handles each one

The dataset's `energy_sum` is quantized to 3 decimal places (kWh), so the smallest possible *real* nonzero MAD is `0.001`.

| Situation | What the code does | Why |
|---|---|---|
| `rolling_7d_mad` is `0` or effectively `0` (below `ZERO_MAD_EPS = 1e-9`) and today **matches** that flat baseline exactly | `robust_score = 0.0` | An exact match to a perfectly flat week is genuinely "zero deviation" — not an indeterminate `0/0`, a real zero |
| `rolling_7d_mad` is effectively `0` and today **differs** from that flat baseline | `robust_score = signed infinity` (`+inf` for a rise, `−inf` for a fall) | This is not an arbitrary placeholder — it is the true mathematical limit of `deviation / MAD` as `MAD → 0` for a fixed nonzero numerator. A perfectly flat week gives no unit of "normal variability" to measure the change against, so the honest answer is "unmeasurably large," which infinity represents exactly |
| `rolling_7d_mad` is a genuine small-but-nonzero number | `robust_score` computed normally by the formula | This is the ordinary, common case |
| Meter has fewer than 7 real historical records so far | `eligibility_status = "insufficient_history"`, not scored | Not enough data yet to have any baseline at all |
| A calendar gap falls inside the trailing 7-day window | `eligibility_status = "gap_in_history"`, not scored | The 7-day window can't be computed without a full 7 real days (see [Section 5.5](#55-why-the-project-reindexes-each-meter-to-a-full-calendar)) |
| A baseline exists, but *today's own* reading is a partial day | `eligibility_status = "incomplete_day"`, not scored (but kept in output) | Explained in [Section 4](#4-data-validation) — scoring a partial day would manufacture false low-consumption anomalies |
| Baseline exists and today is a complete day | `eligibility_status = "eligible"`, scored normally | The default, healthy case |

`NaN` values are never silently treated as `0` anywhere in this module — a row that cannot be scored gets `robust_score = NaN` and an explicit `eligibility_status`, never a fabricated `0`.

### 6.6 Why incomplete days are excluded from scoring but kept in the output

The row is not deleted — it stays in the final results table with `is_complete_day = False` and `eligibility_status = "incomplete_day"`, so an analyst or the dashboard can still see "this day happened, but we don't have enough data to say whether it was unusual," rather than the day silently disappearing.

### 6.7 Thresholding: why a percentile, not a fixed cutoff like "3.5"

The code never hardcodes a textbook cutoff like "flag anything with `|z| > 3.5`." Instead, `recommend_threshold()` computes the cutoff as the **99th percentile** of `|robust_score|` among eligible, finite-score rows (`DEFAULT_ANOMALY_PERCENTILE = 99.0`).

- A **percentile** answers "what value is bigger than N% of all the other values in this set?" The 99th percentile of a set of scores is the value that only the most extreme 1% of scores exceed.
- **Why not a fixed z-score cutoff:** a fixed number like 3.5 assumes the score distribution looks like a textbook bell curve. Real consumption-deviation data is **heavy-tailed** (a small number of days deviate enormously, far more than a normal distribution would predict) — a fixed cutoff calibrated for a bell curve would flag either far too many or far too few days depending on how heavy the real tail happens to be. A percentile-based cutoff instead asks the data itself "what does the top 1% actually look like here," which adapts automatically.
- **Why the anomaly rate isn't exactly 1%:** the 99th-percentile threshold is computed only from **finite-score, eligible** rows — but `±infinity` scores (the "broke a flat baseline" case above) are **always** counted as anomalies regardless of the threshold's numeric value, since infinity is by definition beyond any finite cutoff. This pushes the true flagged rate slightly above a clean 1%. Measured directly from the current results: **statistical anomalies make up roughly 0.5–0.6% to just over 1% of eligible rows depending on which stage of the pipeline you look at** (see [Section 19](#19-results-and-validation) for the exact figures at each stage) — a heavy-tailed distribution does not split into a perfectly round percentage.

### 6.8 Spikes vs. drops — a genuine, physical asymmetry

- **Spikes** (`deviation > 0`) are **mathematically unbounded above** — there is no upper limit on how much more electricity a meter could suddenly report using.
- **Drops** (`deviation < 0`) are **physically bounded below by zero** — a meter cannot consume less than 0 kWh. A meter that was already using very little can only fall so far before it hits the floor.

This asymmetry is not a detail — it turns out to materially shape the whole hybrid-detection design, explained fully in [Section 11](#11-spikedrop-decision-logic).

---

## 7. Isolation Forest

### 7.1 What is Isolation Forest? (Beginner intuition first)

Imagine 100 people standing in a room, positioned according to their height, weight, and age. Most people cluster together in the "normal" middle of the room — average height, average weight, average age. A handful of people, though, sit off in the margins: very tall, very light, unusually old for their height, etc.

Now imagine trying to "isolate" one specific person from everyone else using only random dividing lines drawn across the room (e.g., "everyone taller than this line goes to the left, everyone shorter goes to the right," then repeat with a new random line and a new random measurement). A person standing in a **crowded, typical part of the room** takes **many** random dividing lines to separate from their neighbors, because there are lots of similar people nearby to keep splitting apart from them. A person standing **far out on their own** can usually be isolated after just a **few** random cuts, because there's simply nobody else nearby to keep sharing a group with.

**Isolation Forest** turns this intuition directly into an algorithm: it is easier ("shorter path") to isolate an anomaly with random splits than it is to isolate a typical point.

### 7.2 The technical mechanism

1. Build many random decision trees (an ensemble — a "forest"). Each tree is built by repeatedly picking a **random feature** and a **random split value** within that feature's observed range, splitting the data in two, and recursing.
2. For each data point, its **path length** in a given tree is how many splits it took to isolate that point alone in its own leaf.
3. Points that are unusual (isolated, in sparse regions of the feature space) tend to get separated out in just a few random splits — **short average path length**.
4. Points that sit in dense, "normal" regions require many more splits to separate from their many neighbors — **long average path length**.
5. Averaging the path length for a point across every tree in the forest, and converting it into a score (via sklearn's `decision_function`), gives a continuous measure of "how easy was this point to isolate" — the model's anomaly score.

No labels are needed anywhere in this process — the model never sees an example marked "this is an anomaly." It only ever sees the structure of the data and infers rarity from how easily a point separates from the crowd. This is why it is called **unsupervised**.

### 7.3 Key parameters, and exactly how this project sets them

| Parameter | Value in this project | Meaning | Why this value |
|---|---|---|---|
| `n_estimators` | `100` | Number of random trees in the forest | The isolation-path-length estimate the algorithm's original paper (Liu et al.) is built around; the code's own validation confirms this already converges well at this dataset's size, so there was no measured benefit to more trees |
| `max_samples` | `'auto'` (sklearn default → `min(256, n_rows)`, so `256` here) | How many rows each individual tree is trained on (a random subsample, not the whole dataset) | Small per-tree subsamples are the actual mechanism that makes Isolation Forest both fast *and* effective — larger samples increase "masking/swamping" (crowds of anomalies hiding each other) per the original paper. With over 1,000,000 rows and each tree seeing only 256, this keeps the whole model fast |
| `contamination` | `0.01` | The fraction of points the model should ultimately label as anomalous when converting scores into a decision (its way of picking a decision threshold) | Chosen to mirror the statistical detector's own ~1% flag rate (`DEFAULT_ANOMALY_PERCENTILE = 99`), so the two independently-designed detectors are comparable rather than one being tuned much more aggressively than the other |
| `random_state` | `42` | Seed for the random number generator | Fixes every "random" choice the algorithm makes (which feature, which split value, which subsample) so that re-running the exact same code on the exact same data always produces the exact same result — required for a reproducible, deterministic POC |

**Is feature scaling necessary?** No, and the project does not scale its features. Distance-based models (like k-means or SVMs) need scaling because they compare raw magnitudes *across* features. Isolation Forest never does this — each split only ever compares one feature to a random threshold drawn from *that same feature's own* observed range, so a split's behavior is unaffected by whether that feature happens to be measured in small or large numbers. On top of that, this project's two Isolation Forest features (below) are already unitless ratios on comparable scales, so there would be nothing to gain from scaling even if the algorithm needed it.

### 7.4 The features Isolation Forest actually uses — final version

```python
IF_FEATURES = ["relative_deviation", "relative_mad"]
```

- **`relative_deviation = deviation_from_rolling_median / rolling_7d_median`** — today's deviation expressed as a *fraction* of the meter's own baseline level (e.g. "40% above normal"), not as raw kWh.
- **`relative_mad = rolling_7d_mad / rolling_7d_median`** — the meter's own recent coefficient of variation: how volatile this meter normally is, as a scale-free ratio.

Both of these are computed from columns `feature_engineering.py` already produces — no new rolling/statistical logic is implemented inside the Isolation Forest module itself.

### 7.5 Do not confuse this with `robust_score`

`relative_deviation`/`relative_mad` are **deliberately not the same statistic** as the statistical detector's `robust_score` (which is `deviation / MAD`, normalized by *variability*). `relative_deviation` instead normalizes by baseline **level**, and `relative_mad` is kept as a *separate second axis* rather than folded into one combined ratio — the code's own reasoning is that Isolation Forest's tree splits can learn the *interaction* between the two (e.g. "large relative deviation, combined with normally-low relative variability, is unusual") more flexibly than one hand-engineered combined score could.

### 7.6 Why the project moved away from raw kWh features

This is one of the most important design decisions in the codebase, and it is fully documented in `isolation_forest_detector.py`'s own module docstring — a genuine before/after investigation, not a hypothetical.

**Round 1 (rejected):** the first version used `energy_sum`, `deviation_from_rolling_median`, `rolling_7d_median`, and `rolling_7d_mad` directly, all in raw kWh units. Measured result: the highest-consumption third of meters (by tertile) had a **~2.86%** anomaly rate, versus only **~0.06–0.07%** for the lower two tertiles — a roughly **45× skew**. The model's anomaly score also correlated **+0.52** with `log(meter's median consumption)`. Testing confirmed the cause was not simply "including `energy_sum`" (dropping it, or even dropping `rolling_7d_median` too, left essentially the same skew): the real cause is that a high-consumption meter's **absolute** deviation from its own baseline is mechanically larger in raw kWh even when its **relative** deviation is no bigger than a low-consumption meter's — and Isolation Forest isolates points by rarity in *raw feature space*, so raw-unit features accidentally built a "which meters use a lot of power" detector instead of a "which meters are behaving unusually relative to themselves" detector.

**Round 2 (adopted):** switching to the two relative-ratio features above measurably fixed this. Tertile skew dropped to **0.76% (high) vs. 1.47% (low)** — a ~2× ratio, and the direction even flipped to a mild *low*-consumption tilt (a materially more defensible source of sensitivity: a small absolute swing on a near-zero-baseline meter produces a large *relative* deviation, which is a real and different phenomenon from "this meter just uses more power"). Correlation with `log1p(meter median energy_sum)` dropped from **+0.52 to −0.08** — effectively decorrelated from consumption level. Overlap with the statistical detector's own flagged rows also became more sensible (Jaccard overlap rose from ~1.3% to ~18.6%, while still remaining a genuinely different, mostly-disjoint signal).

**Alternatives tested and rejected alongside the final choice:** using `pct_change_1d`/`pct_change_7d` directly (rejected — these divide by a single lag day rather than a 7-day median, the same instability `statistical_detector.py` already documents and avoids); adding `day_of_week`/`is_weekend` to the feature set (rejected — correlation with the two chosen features was ≤0.005, no measured reduction in tertile skew, and it actually *reduced* overlap with the statistical detector).

### 7.7 One global model, not one per meter

A single Isolation Forest is trained across all 1,637 meters together — the project does **not** train one model per meter. This works because both features are already **per-meter ratios** (today's value relative to that specific meter's own trailing baseline and volatility), so a single tree ensemble already evaluates every row in meter-relative terms without needing thousands of separate per-meter models.

### 7.8 The undefined-relative-baseline edge case

`relative_deviation` and `relative_mad` both divide by `rolling_7d_median`. When a meter's trailing week is a completely flat, zero-consumption week (e.g. a vacant or disconnected meter), this denominator is exactly zero — measured directly: **3,587 of 1,024,971** otherwise-eligible rows (0.35%). For these rows the ratio is not just numerically unstable, it is **mathematically undefined** (`0/0` or `x/0`), so — following the same "exclude, don't invent a value" policy the statistical detector applies to its own zero-MAD case — these rows are reclassified out of Isolation Forest eligibility into `if_eligibility_status = "undefined_relative_baseline"`, rather than imputed, clipped, or padded with an epsilon.

### 7.9 Output convention

`score_isolation_forest_anomalies()` returns `if_score = −model.decision_function(X)` — the sign is deliberately flipped from scikit-learn's own convention (where *lower/negative* means *more* abnormal) so that, in this project, **bigger number = more unusual** for both detectors consistently, matching `|robust_score|`'s convention.

---

## 8. Why Two Detectors?

The project runs **both** a formula-based statistical detector and an unsupervised Isolation Forest, and this section explains concretely how they actually complement each other — not just that they do.

| Property | Statistical Detector | Isolation Forest |
|---|---|---|
| Learning type | Fixed formula (robust z-score) | Unsupervised machine learning (ensemble of random trees) |
| Supervision | None — pure statistics, no fitting/training step | None — trained on unlabeled data, but a real model-fitting step still happens |
| Main idea | "How many baseline-variability-units away from this meter's own recent median is today?" | "How easily can this point be isolated from the crowd by random splits?" |
| Features used | `deviation_from_rolling_median`, `rolling_7d_mad` | `relative_deviation`, `relative_mad` |
| Strength | Fully transparent/explainable; works with minimal history; correctly and confidently detects severe drops (including the `−inf` case) | Can detect a *combination* of relative deviation and relative volatility being jointly unusual — a shape of anomaly a single formula doesn't directly target |
| Weakness | Single fixed formula — only captures one specific mathematical notion of "unusual" | Not built to rank drop *severity* meaningfully (see [Section 11](#11-spikedrop-decision-logic)); its score is a rarity measure, not a magnitude measure |
| Detects spikes | Yes, strongly | Yes |
| Detects drops | Yes, including the strongest possible case (`robust_score == −inf`) | Weakly — measured correlation between IF's ranking and the statistical detector's ranking, restricted to drops only, is ~0.13 (essentially none) |
| Meter-relative | Yes, by construction (baseline is that meter's own history) | Yes, because its two input features are both per-meter ratios |
| Handles nonlinear/joint relationships between multiple signals | No — it is a single formula over two fixed inputs | Yes — tree splits can learn interactions between `relative_deviation` and `relative_mad` that a hand-written formula would have to be explicitly designed to capture |
| Interpretability | Very high — every number in the formula can be manually recomputed and explained | Lower — the score comes from ensemble path lengths, not a formula a person can walk through by hand |
| Computational behavior | Simple vectorized arithmetic — extremely fast | Requires fitting 100 trees over ~1M rows — meaningfully more compute, though still fast in absolute terms on this dataset size (see [Section 20](#20-performance)) |

**Concretely, what each one sees that the other may miss:** the statistical detector is *certain* and *severe* about a meter whose consumption collapses to zero after a stable history (`robust_score = −inf`) — but Isolation Forest, looking at the same event, sees a "flat baseline near zero" pattern that is actually **common across many different low/intermittent-consumption meters**, so it does *not* treat it as rare. Conversely, Isolation Forest can flag a row where *both* the relative deviation and the relative volatility are simultaneously a bit elevated — not extreme enough for either one alone to trip a fixed threshold, but unusual as a *joint* pattern, which the statistical detector (which only ever looks at the deviation-to-MAD ratio, and nothing else) has no way to represent.

Measured evidence of genuine disagreement, not redundancy: **Jaccard overlap between the two detectors' own boolean flags is ~18.6%** — meaning roughly 81% of what each one flags, the other does not independently agree with. That is exactly the profile of two detectors that are looking at real, different things, not one detector duplicating the other. Using only one of the two would either lose reliable drop detection (statistical-only) or lose the ability to catch jointly-unusual relative patterns (Isolation-Forest-only).

---

## 9. Why Not Other ML Algorithms?

The project deliberately did not use several other well-known anomaly-detection approaches. This section explains what each one is, and — precisely — why it was judged unnecessary *for this specific POC*, which is different from saying it is a bad technique in general.

| Alternative | What it is | Supervision | Would it fit this POC? | Why not chosen here | What it would need |
|---|---|---|---|---|---|
| **One-Class SVM** | Learns a boundary around "normal" data in feature space; anything outside is anomalous | Unsupervised | Plausible, but distance/kernel-based, so needs careful feature scaling and kernel tuning | Isolation Forest already provides a comparable unsupervised signal with less tuning overhead and no scaling requirement, at this dataset size | Careful kernel/hyperparameter selection, feature scaling |
| **Local Outlier Factor (LOF)** | Flags points whose local neighborhood density is much lower than their neighbors' | Unsupervised | Plausible for local density anomalies | Computationally heavier at ~1M rows (distance-based, scales poorly); Isolation Forest's tree-based approach was judged sufficient and cheaper here | Distance computation at scale, neighbor-count tuning |
| **DBSCAN** | Density-based clustering; points that don't belong to any dense cluster are "noise" (anomalies) | Unsupervised | Possible, but primarily a clustering algorithm repurposed for anomaly detection | Same scaling concern as LOF; also sensitive to its `eps`/`min_samples` parameters, adding tuning burden without a clear POC-stage benefit | Careful distance-parameter tuning, scaling |
| **K-Means-based anomaly detection** | Cluster the data, then flag points far from their nearest cluster centroid | Unsupervised | Possible, coarse-grained | Assumes roughly spherical clusters; the "meter-relative ratio" feature space here isn't naturally cluster-shaped, and this adds a clustering-quality dependency Isolation Forest doesn't have | Choosing k, scaling, validating cluster shape assumptions |
| **Autoencoders** | A neural network trained to reconstruct its own input; large reconstruction error signals an anomaly | Unsupervised (self-supervised) | Possible in principle | Substantially more implementation and training complexity, needs a deep-learning framework and tuning, and offers little interpretability benefit over the two simpler detectors already used, for a POC of this scope | A DL framework, training infrastructure, more data to train reliably, hyperparameter search |
| **LSTM / GRU (recurrent neural networks)** | Neural sequence models that learn temporal patterns and can flag deviations from a learned sequence model | Unsupervised/self-supervised, or supervised if used for forecasting-then-comparing | This is a **forecasting-style** approach — explicitly out of scope (this project detects deviation from a historical baseline, not deviation from a *predicted* future value) | Would require a training/forecasting step, far more compute, and blurs into "forecasting," a capability this project explicitly does not implement (see [Section 1.5](#15-what-this-poc-demonstrates--and-what-it-deliberately-does-not-do)) | Sequence-model training infrastructure, much more compute and tuning |
| **Random Forest / XGBoost (as classifiers)** | Supervised tree-ensemble classifiers | **Supervised** | **No — there are no ground-truth anomaly labels anywhere in this dataset** | Cannot be trained without labeled "this was/wasn't an anomaly" examples, which this project does not have | A labeled dataset of confirmed anomalies (e.g. from manual review or confirmed incidents) |
| **ARIMA / other forecasting models** | Statistical time-series forecasting; anomalies are detected as large forecast errors | Statistical (fit per series) | Forecasting-based, not baseline-comparison-based — out of scope by the same reasoning as LSTM above | Would require fitting a separate time-series model per meter (1,637 of them) and is a fundamentally different technique (predict-then-compare, not baseline-then-compare) | Per-meter model fitting infrastructure, forecast-accuracy validation |
| **Prophet (or similar forecasting libraries)** | A trend/seasonality decomposition forecasting tool | Statistical (fit per series) | Same as ARIMA — forecasting, not baseline comparison | Same reasoning as ARIMA | Same as ARIMA |
| **PCA-based anomaly detection** | Reduce dimensionality, flag points with large reconstruction error after projecting back | Unsupervised | Possible, but most valuable with many correlated features | This project intentionally works with a small, carefully chosen feature set (2 features for Isolation Forest) rather than a high-dimensional one — PCA's main benefit (dimensionality reduction) doesn't apply | A larger, more redundant feature set to make dimensionality reduction worthwhile |
| **Clustering-based anomaly detection (general)** | Anomalies = points far from any cluster | Unsupervised | Covered by the K-Means/DBSCAN entries above | Same reasoning as those two | Same as those two |

**The consistent reasoning behind every "why not," stated once, explicitly:** this POC has **no anomaly labels** (ruling out every supervised option outright), needs **meter-specific relative behavior** rather than global structure (favoring the relative-ratio approach already adopted), needs to run efficiently over roughly **one million rows** without heavy tuning, and — because this is explicitly a proof of concept, not a production system — needs **explainability and low implementation complexity** more than it needs to chase a marginal accuracy gain from a heavier model. None of the above alternatives are being dismissed as universally bad; several (autoencoders, LSTM-based forecasting, LOF) are reasonable directions for a *future, production-grade* version of this system, particularly once real labeled feedback exists. The distinction this report is careful to maintain: **"not chosen because unnecessary for this POC's scope" is not the same claim as "not useful in general."**

---

## 10. The Hybrid Anomaly Detector

### 10.1 What "hybrid" means here

A hybrid anomaly detector combines two (or more) independent detection signals into a single, unified decision, rather than making the dashboard show two separate, unreconciled anomaly lists. `src/hybrid_detector.py` is the module that does this — and, per its own module docstring, it reuses both detectors' outputs completely unchanged; it recomputes no rolling/statistical/model logic of its own.

### 10.2 Why the two raw scores cannot simply be averaged

`robust_score` (statistical) and `if_score` (Isolation Forest) are **not on comparable scales**: `robust_score` is unbounded and can be literally `±infinity`, while `if_score` is a bounded, roughly-normal-shaped quantity from scikit-learn's `decision_function` (measured range in this project's own validation: roughly −0.35 to 0.13). Averaging these two numbers directly would let `robust_score`'s scale — and its infinities — completely dominate any combination, making `if_score`'s contribution meaningless by comparison.

### 10.3 The fix: percentile-rank normalization

Both scores are converted into a **percentile rank** between 0 and 1 via pandas' `Series.rank(pct=True)`, computed over the same "hybrid-eligible" population for both:

- **`statistical_evidence = rank_pct(|robust_score|)`** — the magnitude of deviation, with direction discarded here (direction is recovered separately for the final Spike/Drop label — see [Section 11](#11-spikedrop-decision-logic)).
- **`if_evidence = rank_pct(if_score)`** — `if_score` is already a pure "how isolated is this point" magnitude, so no absolute value is needed.

A **percentile rank** answers: *"what fraction of all other rows does this row's raw score beat?"* Both `statistical_evidence` and `if_evidence` therefore mean exactly the same thing on exactly the same 0–1 scale — "this row's score under this detector is higher than `evidence × 100%` of all hybrid-eligible rows" — even though the two raw scores they came from are completely different units and shapes.

**Why rank-based normalization instead of min-max rescaling:** min-max scaling (`(x − min) / (max − min)`) would require the two raw distributions to have a comparable *shape*, and both are heavy-tailed/skewed rather than roughly uniform or bell-shaped — exactly the situation where rank normalization is the more defensible choice, because it makes no assumption about either distribution's shape at all. Rank normalization also handles `robust_score`'s `±infinity` values for free — `rank()` simply treats them as the largest/smallest values in the set, with no special-casing or clipping required.

### 10.4 The combination formula and why the weights are 0.5/0.5

```text
hybrid_score = 0.5 × statistical_evidence + 0.5 × if_evidence
```

An equal 50/50 weighting was kept rather than tuned, because the measured Spearman-style correlation between the two evidence columns is **0.44** — a moderate positive relationship, comfortably short of near-1.0 (which would suggest one signal is redundant and could be dropped) and comfortably short of ~0 (which would suggest one signal is pure noise and shouldn't be trusted equally). A correlation in that middle range gives no strong statistical reason to move off the simplest, most interpretable starting point.

**Worked example:** if a row's statistical evidence beats 99.8% of the hybrid-eligible population (`statistical_evidence = 0.998`) and its Isolation Forest evidence beats 92% of that same population (`if_evidence = 0.92`), then `hybrid_score = 0.5 × 0.998 + 0.5 × 0.92 = 0.959`.

### 10.5 The threshold: 0.99, and why it isn't an arbitrary round number

`HYBRID_ANOMALY_THRESHOLD = 0.99` was chosen by directly inspecting, at a grid of candidate cutoffs, how many hybrid-flagged rows were flagged by **neither** individual detector's own independent boolean decision:

| Threshold | Rows flagged | Flagged by neither detector alone |
|---|---|---|
| 0.975 | 10,624 | 2,114 (19.9%) |
| 0.980 | 8,740 | 1,186 (13.6%) |
| 0.985 | 6,791 | 377 (5.6%) |
| 0.988 | 5,417 | 81 (1.5%) |
| **0.990** | **4,489** | **0 (0.0%)** |
| 0.992 | 3,569 | 0 (0.0%) |

**0.99 is exactly the elbow** where "rows neither detector independently agreed on" drops to, and stays at, zero. Below it, a growing share of "hybrid anomalies" would be rows that neither detector, on its own, considered unusual — the hybrid effectively manufacturing new findings out of two individually-unremarkable scores. At or above 0.99, every hybrid anomaly is corroborated by at least one detector's own independent decision. There is also a direct algebraic reading that makes this not an arbitrary round number: `hybrid_score = 0.5×(a+b) ≥ 0.99` forces `max(a, b) ≥ 0.99` — meaning at least one of the two evidence values must itself sit at or past the ~99th-percentile bar each individual detector already uses for its own decision threshold. **0.99 is the smallest round threshold consistent with "at least one detector must independently agree."**

**Stated trade-off, not hidden:** at the looser 0.98 threshold, 1,186 additional rows (13.6% of that threshold's flags) are cases where *both* detectors are moderately-but-not-individually-alarmingly elevated — precisely the "neither alone is sure, but together the evidence is stronger" case a hybrid detector exists to catch. At 0.99, that category is excluded entirely. The project's own documentation is explicit that, as configured, this module currently behaves closer to "a shared ranking over the union of the two individual detectors' anomaly sets" than a generator of brand-new joint-evidence discoveries — a deliberately conservative choice for a POC.

### 10.6 Confidence labels

For rows flagged as anomalies: **`"Both"`** if both individual detectors independently flagged it, **`"Single"`** if exactly one did, and **`"Combined"`** if neither individual detector flagged it but the averaged evidence still cleared the threshold. Given the 0.99 threshold chosen above, `"Combined"` is expected to be empty in a normal run — and this is confirmed directly against the live results file: **0 rows** currently carry `confidence == "Combined"** (3,239 are `"Both"`, 1,920 are `"Single"`).

---

## 11. Spike/Drop Decision Logic

### 11.1 The discovery: the hybrid threshold alone strongly favored spikes

An important finding, fully documented in `hybrid_detector.py`'s own module docstring: at `HYBRID_ANOMALY_THRESHOLD` alone, **every** flagged anomaly was a Spike — **zero Drops** — even though the statistical detector independently identifies severe drops, including its strongest possible evidence category (`robust_score == −inf`).

### 11.2 Why this happened

- `relative_deviation` (the Isolation Forest feature from [Section 7.4](#74-the-features-isolation-forest-actually-uses--final-version)) is **bounded below at exactly −1** (consumption cannot go below zero, so a total collapse to zero is the most extreme drop mathematically possible) but **unbounded above** (a spike has no ceiling). A consequence: "flat baseline collapses to (near) zero" is a pattern **shared by many different meters** — and things that are common are, correctly, exactly what an isolation-based model does *not* treat as rare. Measured directly: rows with `statistical_score == −inf` (the strongest possible statistical drop evidence, 653 eligible rows) only ever reach `if_evidence` in the range **0.836–0.979** — never the 0.99 needed to help clear the hybrid threshold.
- This was confirmed to be a real ranking mismatch, not just "Isolation Forest is a bit worse at ranking drops": the top 200 eligible drops ranked by `if_evidence` and the top 200 ranked by `statistical_evidence` share **zero rows in common**, and the correlation between `if_score` and `|statistical_score|`, restricted to drops only, is **0.13** (essentially none) — versus a real, usable relationship for spikes. Requiring Isolation Forest corroboration for a drop is therefore not "requiring a sensible second opinion" the way it usefully is for spikes; it is requiring agreement from a signal that, for this one direction, is not measuring the same underlying thing.

### 11.3 Two fixes that were tried and rejected

1. **A drop-specific hybrid threshold**, found the same way as the main 0.99 cutoff (the point where "neither detector individually agrees" hits zero, computed within drops only): that point turned out to be 0.975, admitting only 198 of 507,200 drop rows (0.039%) — and checking those 198 showed they were selected mostly by incidentally high `if_evidence` values that, per 11.2 above, don't actually track real drop severity. This threshold would have pruned valid statistical evidence using an uninformative second criterion, not added real information.
2. **Matching drops to spikes' overall flag rate** (finding whatever drop-side percentile would flag the same ~0.87%-of-population share that spikes get): rejected outright — it required a cutoff of 0.9256, which would have flagged 4,435 drops, of which 3,860 (87%) were agreed on by **neither** individual detector — exactly the low-quality, forced-rate outcome the project's own design principles rule out.

### 11.4 The adopted solution: a severe-drop override

```text
is_severe_drop = eligible AND (deviation < 0) AND is_statistical_anomaly
is_anomaly     = is_hybrid_anomaly OR is_severe_drop
```

This introduces **no new constant**: `is_statistical_anomaly` is the statistical detector's own already-justified decision, reused completely unchanged, and `deviation < 0` is a plain sign check, not a tuned magic number. It never overlaps with `is_hybrid_anomaly` (measured: **0 of the 670 qualifying rows** also independently clear the 0.99 hybrid threshold), so it purely **adds** drop coverage rather than double-counting anything. `hybrid_score` itself is completely unmodified by this rule — it stays a continuous ranking; only the final binary `anomaly_status` decision gains this second, direction-specific path.

**Stated caveat, not hidden:** the 670 qualifying rows span 223 meters, but are noticeably concentrated on a handful of them (one single meter alone contributes 32 of the 670) — consistent with a few low/intermittent-consumption meters whose "off" days repeatedly look extreme against a baseline set by an occasional "on" day. This is a pre-existing property of the statistical detector's own zero-MAD handling ([Section 6.5](#65-edge-cases--exactly-how-the-code-handles-each-one)), not something newly introduced by the override.

### 11.5 Anomaly type and the final distribution

For rows where `anomaly_status == "Anomaly"`: `"Spike"` if `deviation > 0`, `"Drop"` if `deviation < 0`, `"Other"` if `deviation == 0` (evidence exists but has no direction). Normal rows get `None` — classifying the "direction" of a non-anomaly isn't meaningful.

**Measured directly from the live results file** (`results/anomaly_results.parquet`, all figures below are re-computed from the actual generated data, not from any prior report):

| Metric | Value |
|---|---|
| Total rows in results | 1,048,575 |
| Unique meters | 1,637 |
| Eligible rows (hybrid/Isolation Forest eligibility) | 1,021,384 |
| **Total anomalies** | **5,159** |
| — Spikes | 4,489 |
| — Drops | 670 |
| Normal (eligible, not anomalous) | 1,016,225 |
| Anomaly rate (of eligible rows) | **0.505%** |
| Confidence: Both | 3,239 |
| Confidence: Single | 1,920 |
| Confidence: Combined | 0 |

This confirms, on the current data, exactly the pattern the design decisions above were built to produce: drops are present in the final output (670 of them, all admitted through the severe-drop override, since the hybrid threshold alone contributes none), and confidence is split between "both detectors agreed" and "only one did," with zero rows relying purely on the averaged-but-uncorroborated "Combined" path — matching the threshold analysis in [Section 10.5](#105-the-threshold-099-and-why-it-isnt-an-arbitrary-round-number) exactly.

---

## 12. Where Is Machine Learning Actually Used?

This section exists specifically to stop the words "statistics," "machine learning," and "AI" from being used interchangeably, since the project uses all three, in genuinely different roles.

- **`statistical_detector.py` is not machine learning.** It is a fixed mathematical formula (a modified z-score) applied identically to every row. Nothing in it is "learned" from the data — the same formula would be written down and evaluated the same way regardless of what the data looked like. This is **robust statistics**, a well-established branch of classical statistics, not ML.
- **`isolation_forest_detector.py` is unsupervised machine learning.** `IsolationForest.fit()` genuinely learns structure from the data — the specific random trees it builds, and therefore every score it produces, depend on the actual distribution of `relative_deviation`/`relative_mad` values it was trained on. Change the underlying data and the model's learned structure (and its scores) changes too, without anyone rewriting a formula. This is the one and only place true machine learning exists in the detection pipeline.
- **`hybrid_detector.py` is neither statistics nor ML on its own** — it is a deterministic **combination/decision layer**: rank normalization, a weighted average, and a threshold comparison, all fixed arithmetic operations applied to the two upstream detectors' already-computed outputs. It learns nothing new from data itself.

**Could this project work without ML?** Yes, in a reduced form — the statistical detector alone is a complete, functioning anomaly detector; it was in fact built and validated as its own working module before Isolation Forest was added. **Could it work without the statistical detector?** Also yes, in a reduced form, but it would lose its most reliable channel for detecting severe drops (see [Section 11](#11-spikedrop-decision-logic)) and its only fully hand-verifiable, formula-based signal. **What does ML specifically add?** The ability to detect a *joint*, non-formulaic pattern across two relative features (see [Section 8](#8-why-two-detectors)) that no single fixed formula was designed to capture. **What does robust statistics specifically add?** Full transparency (every number can be manually recomputed), correct behavior with very little historical data, and — critically — the project's only reliably strong signal for the most severe drops.

**Why the project does not require supervised learning:** none of the datasets contain a ground-truth "this day was/wasn't actually anomalous" label anywhere. Supervised learning requires exactly that kind of labeled example to learn from, so it was structurally not an option here (see [Section 9](#9-why-not-other-ml-algorithms)) — unsupervised and statistical approaches were not a stylistic preference, they were the only techniques the available data actually supports.

---

## 13. Where Is AI Actually Used?

This section traces the "AI Analyst" / anomaly-analysis feature directly through the actual code, rather than assuming what it might do.

### 13.1 Which AI model/provider, and how it is called

- **Provider:** [OpenRouter](https://openrouter.ai) — a hosted API that routes chat-completion requests to various underlying LLMs.
- **Model:** `openai/gpt-4o-mini` (hardcoded as `MODEL` in `src/ai/llm_client.py`).
- **How it's called:** `src/ai/llm_client.py`'s `complete(system_prompt, user_prompt)` function is the **only** place in the entire project that knows OpenRouter's URL, request shape, or model name — every AI feature routes through this one function, using the Python standard library only (`urllib.request`), one **synchronous, non-streaming** JSON POST per call, with a 30-second timeout. There are no retries, no fallback model, and no cached/mocked response on failure — any failure (missing API key, network error, malformed response, timeout) is always raised as one of four specific exception types (`LlmConfigurationError`, `LlmTimeoutError`, `LlmRequestError`, `LlmResponseError`) and mapped by `src/api.py` to HTTP 503/504/502 respectively — it is never silently swallowed.
- **Configuration:** the API key (`OPENROUTER_API_KEY`) is read from a local `.env` file (loaded via `python-dotenv` at `src/api.py` import time). If it is not set, every AI endpoint returns HTTP 503 rather than failing in some less explicit way — confirmed directly by the test suite (`tests/test_ai_endpoints.py`). *(This report deliberately does not reproduce the actual key value present in the local `.env` file — that is a secret, correctly `.gitignore`d, and out of scope for a technical report to echo.)*

### 13.2 What input/context it receives — traced exactly from the code

There are **four** distinct AI-backed features, each with its own context-builder in `src/ai/`, and each grounded in a different, precisely scoped slice of already-computed data — **never** raw datasets, and **never** anything the AI itself invents or fetches:

| Feature | Endpoint | Context builder | What it's given |
|---|---|---|---|
| Anomaly explanation | `POST /api/ai/anomalies/{meter}/{day}/explain` | `ai/anomaly_context.py` | The selected anomaly's own record (all detector scores), a ±14-day window of that same meter's history around it, that household's tariff/ACORN metadata, and how its ACORN group/tariff segment compares dataset-wide |
| Household explanation | `POST /api/ai/households/{meter}/explain` | `ai/household_context.py` | That household's summary statistics record, plus its most recent 30 days of daily consumption features |
| Dashboard explanation | `POST /api/ai/dashboard/explain` | `ai/dashboard_context.py` | Two clearly separated JSON blocks: (1) `anomaly_population` — overall summary counts, a recent 6-month trend, the segment breakdown, and the top 5 highest-anomaly-activity households from the 1,637-meter anomaly population; (2) `household_sample_population` — the *separate*, unrelated 50-meter consumption sample from `block_0.csv`, explicitly labeled with a `scope_note` warning the AI never to blend the two populations |
| Multi-turn chat | `POST /api/ai/chat` | `ai/chat_context.py` (reuses `ai/dashboard_context.py`'s context builder) | The same two-block dashboard context as above, plus the last 20 turns of the conversation transcript (`MAX_CHAT_HISTORY_MESSAGES = 20`), so follow-up questions like "what about that meter" can be resolved — but the system prompt explicitly instructs the model to use prior turns only to understand what's being asked, never as a source of facts unless those facts also appear in the supplied JSON |

Every context-builder is a **pure assembly/read layer**: it re-reads nothing from disk, re-derives no new statistic, and calls no ML/detector code. It only selects and reshapes numbers that `results_store.py`, `household_features.py`, or `anomaly_segmentation.py` had already computed.

### 13.3 What output it generates, and what it does *not* do

- **Output:** a plain-text natural-language response (`analysis: str` for the single-shot endpoints, `message: str` for chat).
- **Does it change the anomaly score, the ML model, or perform detection itself?** **No — confirmed by tracing the code.** No AI endpoint writes to `results/anomaly_results.parquet`, calls any detector module, or feeds back into any scoring path. The AI layer is strictly downstream and read-only with respect to detection.
- **Is it deterministic or generative?** Generative — it is an LLM producing free-form text, not a fixed formula. Re-running the same request is not guaranteed to produce byte-identical text (unlike the deterministic detection pipeline, whose own determinism is explicitly tested — see [Section 19](#19-results-and-validation)).
- **Is AI required for the core anomaly detector to work?** **No.** The entire detection pipeline (`pipeline.py` through `results/anomaly_results.parquet`) runs completely independently of the AI layer and requires no API key at all. AI is purely an optional explanation layer bolted on top.

### 13.4 Detection vs. Analysis/Explanation — and the architecture this confirms

The code confirms exactly the "detect, then explain" architecture, in this order and no other:

```text
ML/statistics detect the anomaly (deterministic, offline, no AI involved)
        ↓
AI is handed a structured, already-computed summary of what was detected
        ↓
AI produces a plain-language explanation grounded in that summary
        ↓
A human reads the explanation on the dashboard
```

The AI never sees raw data files, never re-derives a number, and — per every one of the four system prompts, which are nearly identical on this point — is explicitly instructed: *use only the facts in the supplied context; never invent numbers, dates, meters, causes, or classifications; never perform new calculations; never assert a specific cause (fraud, equipment failure, occupancy change, etc.) as fact unless it is literally present in the supplied data* (and the supplied data never states a cause). This is a **explanation/interpretation layer**, not a **root-cause reasoning** layer, and the prompts are written specifically to prevent the model from drifting into inventing causes it was never given evidence for.

### 13.5 Why AI was added, and what it contributes beyond raw ML output

A raw detection result looks like: *"MAC001348, 2013-04-02, hybrid_score = 0.9999, anomaly_type = Spike."* That is exact and auditable, but not something a non-technical stakeholder can act on quickly. The AI layer's contribution is turning **"this meter is anomalous"** into **"this meter is anomalous because [grounded, data-cited description of what the numbers show]"** — in plain business language, while explicitly refusing to claim a definite cause it wasn't given.

### 13.6 Limitations, stated plainly

- **Hallucination risk:** inherent to any LLM; mitigated here (not eliminated) by tightly scoping the context and instructing the model repeatedly to refuse ungrounded claims — but the system prompt is a guardrail, not a guarantee.
- **Dependency on LLM availability:** if OpenRouter is unreachable or the API key is missing/invalid, every AI endpoint fails explicitly (503/504/502) — the dashboard's numeric data still works, only the AI narrative is affected.
- **API cost and latency:** every AI call is a live network request to a paid external API with up to a 30-second timeout; this is not free or instant, and nothing in the code caches or reuses AI responses.
- **Prompt sensitivity:** behavior depends on the exact wording of the system prompts in `src/ai/*.py`; changing them changes behavior, as with any LLM-based feature.
- **Grounding, not invention:** the project takes this seriously enough to encode it directly into every system prompt rather than leaving it to chance.
- **The AI is not, and is not designed to be, the anomaly detector.** It never scores, classifies, or flags anything — it only explains what the deterministic pipeline already decided.

### 13.7 What role does the AI play, precisely?

Based strictly on the implementation: the AI in this project functions purely as an **analyst / explanation layer** and a **conversational interface** over already-computed results. It is explicitly **not** used as a detector, a classifier, or a decision-support layer that influences what gets flagged — those roles belong entirely to the statistical and Isolation Forest detectors described in Sections 6–11.

---

## 14. Statistics vs. Machine Learning vs. AI

A short, beginner-friendly framing before mapping it to this specific project:

- **Statistics** answers: *"What happened, and how unusual is it relative to history?"* — using fixed, human-derivable formulas.
- **Machine Learning** answers: *"Can a model automatically learn patterns or rules directly from data, without a human writing the rule down?"*
- **Generative AI** answers: *"Can we take a result and communicate/interpret it intelligently, in natural language, for a human reader?"*

| Layer | Technology | Purpose |
|---|---|---|
| Data | `daily_dataset.csv.xlsx`, `block_0.csv`, `informations_households.csv` | Raw and metadata source of truth |
| Statistics | `statistical_detector.py` (modified z-score on robust median/MAD) | Transparent, formula-based "how unusual is this, relative to this meter's own recent history" |
| ML | `isolation_forest_detector.py` (unsupervised `IsolationForest`) | Learned, model-based "how rare/isolated is this point" on meter-relative ratio features |
| Hybrid logic | `hybrid_detector.py` (rank normalization + weighted average + threshold + severe-drop override) | Deterministic combination of the two signals above into one final decision |
| AI | `src/ai/*.py` + OpenRouter (`openai/gpt-4o-mini`) | Turns already-detected, already-computed results into grounded, plain-language explanations |
| API | `src/api.py` (FastAPI) | The only channel the frontend is allowed to use to reach any of the above |
| Frontend | `frontend/` (Next.js/React) | Human-facing presentation of the API's data and AI explanations |

---

## 15. Why This Is a Proof of Concept (POC)

This project has the concrete hallmarks of a POC, verifiable directly from its configuration:

- **Local dataset only** — three files under `data/`, loaded from a repo-relative path, never a database connection.
- **Local processing only** — the entire pipeline runs as a single local Python process (`python -m src.pipeline`); there is no distributed processing, no job scheduler, no cloud compute service configured anywhere.
- **No database** — results persist to a single Parquet file on local disk, not any SQL/NoSQL database.
- **No containerization** — no `Dockerfile` or `docker-compose.yml` exists anywhere in the repository.
- **No cloud infrastructure** — no cloud-provider SDK, deployment config, or infrastructure-as-code file exists in the repository.
- **No authentication/authorization** — `src/api.py` has no login, session, token, or user-permission system of any kind; every endpoint is open to anyone who can reach it.
- **Parquet as the result store** — a compact, local, columnar file format, chosen (per `pipeline.py`'s own comments) specifically because it reads/writes ~1M rows quickly and preserves dtypes, not because it's a production data store.
- **FastAPI + Next.js, run locally** — `uvicorn src.api:app --reload` and `next dev`, the standard local-development invocations for both frameworks; nothing in the repo configures a production web server, process manager, or reverse proxy.
- **AI integration is a direct external API call** — no self-hosted model, no queueing, no rate-limiting, no retry/backoff logic beyond a single synchronous request with a timeout.

### What would need to change for a production system

None of the following exist in this repository today — they are listed here as what a future production version would need, not as claims about what already exists:

- **Streaming/real-time ingestion** — the pipeline currently processes one static local file in a single batch run; a production system handling live meter readings would need a real ingestion path.
- **A database or data warehouse** — to replace the local Parquet file for both the raw data and the results, with proper indexing and concurrent-write support.
- **Distributed processing** — if data volume grew well beyond ~1M rows/1,637 meters, the current single-process pandas approach would need to become distributed (e.g. Spark, Dask, or similar).
- **Model monitoring and retraining** — nothing currently tracks whether the Isolation Forest's learned structure is still appropriate as new data arrives; a production system would need scheduled retraining and drift checks.
- **Data drift detection** — no code currently checks whether the incoming data distribution has shifted from what the model was built on.
- **Alerting** — the dashboard is pull-based (a human has to open it); there is no push notification, email, or alert-integration system.
- **Authentication/authorization** — every API endpoint is currently open; production would need real access control.
- **Secrets management** — the OpenRouter API key currently lives in a local `.env` file; production would need a proper secrets manager.
- **Cloud infrastructure** — hosting, autoscaling, load balancing — none of this exists yet.
- **Structured logging / observability** — the codebase currently uses simple `print()`-based validation reports for offline runs; production would need structured logs, metrics, and tracing.
- **Rate limiting** — nothing currently limits how often the (paid, external) AI endpoints can be called.
- **Scalable AI infrastructure** — the current AI integration is a single synchronous call per request with no queueing or batching.
- **A feedback/labeling loop** — there is currently no mechanism for a human to confirm or reject a flagged anomaly, which would be the natural first step toward eventually enabling supervised learning (see [Section 9](#9-why-not-other-ml-algorithms)).
- **Formal model evaluation against ground truth** — because no labels exist, there is currently no precision/recall-style evaluation of either detector; the project's own extensive threshold-selection reasoning ([Sections 10](#10-the-hybrid-anomaly-detector)–[11](#11-spikedrop-decision-logic)) is the closest substitute available today.

---

## 16. Backend Architecture, File by File

| File | Responsibility | Key inputs | Key outputs | Depends on | Notable functions |
|---|---|---|---|---|---|
| `src/data_validation.py` | Load and profile the Excel dataset; establish ground truth about its shape and quality | `data/daily_dataset.csv.xlsx` | A validated DataFrame + a printed data-quality report | Nothing internal (entry point) | `load_dataset()`, `profile_dataset()`, `sample_meter_timelines()` |
| `src/feature_engineering.py` | Build the meter-aware, leakage-safe feature table | The validated DataFrame | A feature table with calendar/completeness/history columns | `data_validation.py` | `build_features()`, `_build_daily_calendar()`, `_rolling_median_mad()`, `_history_features()`, `_check_no_future_leakage()` |
| `src/statistical_detector.py` | Score every row with a robust modified z-score | The feature table | `robust_score`, `eligibility_status`, `is_statistical_anomaly` per row | `data_validation.py`, `feature_engineering.py` | `score_statistical_anomalies()`, `_eligibility_status()`, `_robust_score()`, `recommend_threshold()` |
| `src/isolation_forest_detector.py` | Score every row with a meter-relative unsupervised Isolation Forest | The feature table | `if_score`, `if_eligibility_status`, `is_if_anomaly` per row | `feature_engineering.py`, `statistical_detector.py` (reuses its eligibility logic) | `score_isolation_forest_anomalies()`, `_if_eligibility_status()`, `compare_with_statistical()` |
| `src/hybrid_detector.py` | Combine both detectors into one final decision | Both detectors' outputs | `hybrid_score`, `anomaly_status`, `anomaly_type`, `confidence` per row | `feature_engineering.py`, `statistical_detector.py`, `isolation_forest_detector.py` | `score_hybrid_anomalies()` |
| `src/pipeline.py` | Orchestrate the whole chain end-to-end; contains no detection logic itself | Raw dataset path | `results/anomaly_results.parquet` + a run report (timings, determinism check) | All of the above | `run_pipeline()`, `save_results()`, `check_determinism()` |
| `src/results_store.py` | Read-only, cached data-access layer over the Parquet results | `results/anomaly_results.parquet` | Filtered/sorted/paginated query results for the API | `pipeline.py`'s output only | `load_results()`, `get_summary()`, `list_anomalies()`, `get_meter_history()`, `get_anomaly_detail()`, `get_monthly_anomaly_trend()`, `get_high_anomaly_households()` |
| `src/household_consumption.py` | Load + join the *separate* 50-meter raw consumption sample to its metadata | `data/block_0.csv`, `data/informations_households.csv` | A joined half-hourly DataFrame | Nothing internal (entry point for Domain B) | `load_block()`, `load_households()`, `build_household_consumption()` |
| `src/household_features.py` | Build half-hourly/daily/per-household analytical tables | `household_consumption.py`'s joined output | Three tables: half-hourly, daily, per-household summary | `household_consumption.py` | `build_half_hourly_features()`, `build_daily_features()`, `build_household_summary()`, `build_monthly_trend()` |
| `src/anomaly_segmentation.py` | The only module joining anomaly results to household metadata (ACORN/tariff) | `results_store.py`'s results, `household_consumption.py`'s metadata loader | Anomaly rate broken down by ACORN group / tariff | `results_store.py`, `household_consumption.py` | `build_anomaly_segment_summary()` |
| `src/profile_new_datasets.py` | Standalone profiling/validation report for `block_0.csv` and `informations_households.csv` | Those two files | A printed data-quality report | `household_consumption.py` | `profile_block()`, `profile_households()`, `cross_validate()` |
| `src/ai/llm_client.py` | The only module that knows how to talk to the OpenRouter API | System + user prompt strings | Raw text reply | Standard library only | `complete()` |
| `src/ai/anomaly_context.py` | Build grounded context + system prompt for anomaly explanations | `results_store.py`, `household_consumption.py`, `anomaly_segmentation.py` | A JSON-safe context dict + `SYSTEM_PROMPT` | Those three modules | `build_anomaly_explanation_context()` |
| `src/ai/household_context.py` | Build grounded context + system prompt for household explanations | Already-built household/daily DataFrames (handed in, not re-loaded) | A JSON-safe context dict + `SYSTEM_PROMPT` | None directly (pure function of its inputs) | `build_household_explanation_context()` |
| `src/ai/dashboard_context.py` | Assemble the two-population dashboard-level context | Already-computed summary/trend/segment/household data (handed in) | A JSON-safe context dict + `SYSTEM_PROMPT` | None directly (pure assembly) | `build_dashboard_context()` |
| `src/ai/chat_context.py` | Frame the same dashboard context for multi-turn conversation | `dashboard_context.py`'s shape + a message history | A single folded user-prompt string + `SYSTEM_PROMPT` | Conceptually reuses `dashboard_context.py`'s structure | `build_chat_user_prompt()` |
| `src/api.py` | The FastAPI application — the only HTTP surface of the whole project | Everything above | JSON HTTP responses | Every module listed above | See [Section 18](#18-api-architecture) for the full endpoint list |

**Execution commands, confirmed from the code:**

```bash
python -m src.pipeline          # runs the full detection pipeline, saves results/anomaly_results.parquet
uvicorn src.api:app --reload    # runs the FastAPI backend locally (loopback only)
uvicorn src.api:app --reload --host 0.0.0.0 --port 8000   # also reachable from other LAN devices
```

Every detector module can also be run standalone (e.g. `python src/statistical_detector.py`) to print its own validation report — a deliberate design choice (`sys.path` manipulation in `pipeline.py` and bare sibling imports throughout `src/`) so each module remains independently testable without requiring the whole pipeline to run first.

---

## 17. Frontend Architecture

### 17.1 Why Next.js, and what "App Router" means here

The frontend (`frontend/`) is a **Next.js 16 / React 19** application using the **App Router** (the `frontend/app/` directory, where each folder maps to a URL route and each `page.tsx` is that route's page). Next.js was chosen (per the project's own README) specifically so the frontend could be a real web application rather than a Python-based dashboarding tool (the README explicitly notes "no Streamlit") — keeping the ML/data layer and the presentation layer in genuinely separate technology stacks, communicating only over HTTP.

### 17.2 Server Components vs. Client Components

Next.js's App Router distinguishes between two kinds of React components:

- **Server Components** (the default — no special marker needed) run on the server, can `await` data-fetching calls directly in the component body, and send only the resulting HTML/data to the browser. Every page in this project (`app/page.tsx`, `app/anomalies/page.tsx`, `app/households/page.tsx`, the detail pages) is a Server Component that calls the API client (`lib/api.ts`) directly with `await`.
- **Client Components** (marked with the `"use client"` directive at the top of the file) run in the browser and can use React state/interactivity (`useState`, event handlers, etc.). This project uses them specifically where interactivity is required: `AiExplainPanel`, `FloatingAiAgent`, `AnalystChat`, filter controls, and pagination controls.

Every dynamic page in this project (the dashboard, the anomaly explorer, the household pages, and both detail pages) is explicitly marked `export const dynamic = "force-dynamic"` — the code comments state the reason directly: these pages must always reflect the latest results, so they are rendered fresh per request instead of being statically pre-rendered at build time.

### 17.3 Pages actually implemented (confirmed from `frontend/app/`)

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Dashboard — headline stats + "Quick Actions" (links to Anomalies/Households, and a button that opens the AI Analyst chat modal) |
| `/anomalies` | `app/anomalies/page.tsx` | Anomaly Explorer — monthly trend chart, ACORN/tariff segment breakdown, a "notable households" table, and the full filterable/paginated anomaly list |
| `/anomalies/[meter]/[day]` | `app/anomalies/[meter]/[day]/page.tsx` | Anomaly detail — full record for one (meter, day) anomaly, a floating "AI Analyst" agent scoped to that anomaly, a consumption-vs-expected chart, and the meter's full history table |
| `/households` | `app/households/page.tsx` | Households list — the 50-meter descriptive-analytics sample, with filters and pagination |
| `/households/[meter]` | `app/households/[meter]/page.tsx` | Household profile — one household's summary stats, daily chart, weekday/weekend comparison, and its own floating AI Analyst agent |

Each route also ships its own `loading.tsx` (Next.js's built-in loading-state convention) and, for the two detail routes, a `not-found.tsx` (shown when `ApiError.status === 404` triggers Next.js's `notFound()`). A root-level `app/error.tsx` handles unexpected errors globally.

### 17.4 The API client layer (`frontend/lib/api.ts`)

`lib/api.ts` is the **only** module in the frontend that constructs an HTTP request to the backend. Every page and component calls a typed function from this file (e.g. `getSummary()`, `getAnomalies(params)`, `explainAnomaly(meter, day, request)`) rather than calling `fetch()` directly. It reads the backend's base URL from `NEXT_PUBLIC_API_URL` (an environment variable) and throws a typed `ApiError` (carrying an HTTP status where available) on any failure, which pages catch to drive their own error/not-found states. `lib/types.ts` mirrors the backend's Pydantic response models by hand, with a comment instructing future editors to keep it in sync and never add a field the backend doesn't actually return.

### 17.5 Anomaly Explorer, meter history, chart, filters, and pagination

- **Anomaly explorer** (`components/anomalies/anomaly-table.tsx`, `anomaly-filters.tsx`, `anomaly-pagination.tsx`): a filterable, sortable, server-driven table over `/api/anomalies`, with filter state encoded in the URL's query string (parsed by `lib/anomaly-query.ts`) so filtered views are shareable/bookmarkable links, not just client-side state.
- **Meter history / chart** (`components/anomalies/meter-history-chart.tsx`, `meter-history-table.tsx`): renders one meter's full timeline (via **Recharts**, the project's charting library — confirmed in `package.json`), plotting actual vs. expected consumption with the selected anomaly and any other flagged days marked.
- **High-anomaly household table** (`components/anomalies/high-anomaly-household-table.tsx` + controls/pagination): a separate, independently sortable/paginated table over `/api/anomalies/by-household`.

### 17.6 Loading states, error states, and not-found handling

- **Loading:** each route's `loading.tsx` is shown automatically by Next.js while the corresponding Server Component's `await`ed data fetch is in flight.
- **Error:** `ApiError` thrown by `lib/api.ts` is caught by pages and either rendered inline (e.g. the anomaly detail page's "Could not load meter history: …" message) or allowed to propagate to `app/error.tsx` for unexpected failures.
- **Not found:** the two `[meter]`/`[day]` detail pages explicitly catch a 404 `ApiError` and call Next.js's `notFound()`, which renders that route's `not-found.tsx`.

### 17.7 The AI Analyst UI, precisely

Two distinct AI UI surfaces exist, matching the two distinct backend interaction modes described in [Section 13](#13-where-is-ai-actually-used):

1. **Contextual, single-record explanation** — `FloatingAiAgent` (a fixed bottom-right button, rendered **only** on the anomaly-detail and household-detail pages, never on list pages or the dashboard) opens a modal containing `AiExplainPanel`, which auto-runs a single "explain this record" request the moment the panel is opened (`autoRun`), and supports one follow-up question at a time via the same endpoint.
2. **Dashboard-level, multi-turn chat** — `QuickActions`' "Talk to AI Analyst" button (dashboard only) opens `AnalystChat` in a modal, which maintains a running conversation and calls `POST /api/ai/chat` with the full transcript on every turn.

### 17.8 How the frontend gets real data, and the API boundary

**The frontend never reads `data/` or `results/` directly — confirmed by the code structure itself:** the frontend has no Python runtime, no filesystem access configured to those paths, and `lib/api.ts` is the sole data-access mechanism, making every network call to `NEXT_PUBLIC_API_URL` + a path under `/api/...`. This is the "API boundary" the project's own README describes: *"the frontend... only ever consumes results from the Python API — it never loads the raw 1M+ row dataset directly."* This report confirms that description matches the actual code.

### 17.9 Frontend testing

The frontend ships real unit tests, runnable via `npm run test` (Vitest, confirmed in `package.json`): `frontend/lib/__tests__/api.test.ts`, `anomaly-query.test.ts`, `household-query.test.ts`, `anomaly-household-query.test.ts`, and `frontend/components/__tests__/pagination.test.tsx`.

---

## 18. API Architecture

`src/api.py` is a single FastAPI application (`app = FastAPI(...)`), started via `uvicorn`, with **no detection or feature-engineering logic of its own** — every endpoint is a thin, typed wrapper around `results_store.py`, `household_features.py`/`household_consumption.py`, `anomaly_segmentation.py`, or the `src/ai/*.py` context builders.

### 18.1 Startup behavior

A `lifespan` context manager runs once at process startup (not on the first request) and: (1) cold-loads the Parquet results into memory (`load_results()`), (2) pre-builds the anomaly-side aggregations (monthly trend, ACORN/tariff segments, the household anomaly rollup), and (3) pre-builds the entire household feature layer (loading `block_0.csv`, joining metadata, and building the half-hourly → daily → household-summary tables). All of this is cached in module-level dicts (`_anomaly_cache`, `_household_cache`) and reused by every subsequent request — no per-request recomputation of anything.

### 18.2 CORS

`CORSMiddleware` is configured with `allow_origins` read from the `FRONTEND_ORIGINS` environment variable (comma-separated), defaulting to `http://localhost:3000` if unset; `allow_methods=["GET", "POST"]`; `allow_headers=["*"]`. This exists specifically so the Next.js dev server (running on a different port/origin than the API) is allowed to call it from the browser — without it, browsers would block the requests outright.

### 18.3 Every endpoint actually implemented

**Core anomaly-results endpoints** (all backed by `results_store.py`, i.e. Domain A / `results/anomaly_results.parquet`):

| Method & Path | Parameters | Purpose | Error behavior |
|---|---|---|---|
| `GET /api/summary` | none | Dataset-wide totals: meters, records, eligible records, anomaly/spike/drop counts, anomaly rate | — |
| `GET /api/anomalies` | `meter?`, `anomaly_type?`, `start_date?`, `end_date?`, `sort_by` (default `hybrid_score`), `ascending`, `page` (≥1), `page_size` (1–500) | Filtered, sorted, paginated anomaly rows | 422 on an invalid `page`/`page_size`/`sort_by` (enforced by Pydantic/FastAPI's `Literal` typing) |
| `GET /api/anomalies/monthly-trend` | none | Dataset-wide monthly eligible/anomaly/spike/drop counts | — |
| `GET /api/anomalies/segments` | none | Anomaly rate broken down by ACORN group and by tariff | — |
| `GET /api/anomalies/by-household` | `sort_by`, `ascending`, `page`, `page_size` | Per-meter anomaly rollup, only meters with ≥1 anomaly | — |
| `GET /api/meters/{meter}/history` | path: `meter` | A single meter's complete daily history (all days, not just anomalies) | 404 if the meter has no records |
| `GET /api/anomalies/{meter}/{day}` | path: `meter`, `day` | Full detail for one (meter, day) record | 404 if no matching record |
| `POST /api/ai/anomalies/{meter}/{day}/explain` | body: `question?` | AI-generated plain-language explanation of that anomaly | 404 (unknown meter/day), 503 (no API key), 504 (LLM timeout), 502 (LLM request/response error) |

**Household analytics endpoints** (backed by `household_consumption.py`/`household_features.py`, i.e. Domain B / `block_0.csv`, the separate 50-meter sample):

| Method & Path | Parameters | Purpose | Error behavior |
|---|---|---|---|
| `GET /api/households/summary` | none | Dataset-wide summary of the 50-meter sample | — |
| `GET /api/households/monthly-trend` | none | Dataset-wide average daily consumption per month | — |
| `GET /api/households` | `stdorToU?`, `Acorn_grouped?`, `sort_by`, `ascending`, `page`, `page_size` | Filtered, sorted, paginated household summary list | — |
| `GET /api/households/{meter}` | path: `meter` | One household's summary record | 404 if not found |
| `GET /api/households/{meter}/daily` | path: `meter`; query: `start_date?`, `end_date?`, `page`, `page_size` | One household's daily feature records | 404 if the meter has no rows |
| `POST /api/ai/households/{meter}/explain` | body: `question?` | AI-generated explanation of that household's consumption profile | 404, 503, 504, 502 (same pattern as above) |

**Dashboard-level AI endpoints:**

| Method & Path | Parameters | Purpose | Error behavior |
|---|---|---|---|
| `POST /api/ai/dashboard/explain` | body: `question?` | AI summary of the current dashboard state (both populations) | 503, 504, 502 |
| `POST /api/ai/chat` | body: `messages: [{role, content}, ...]` | Multi-turn AI Analyst conversation | 400 if `messages` is empty or the last message isn't from the user; 503, 504, 502 |

*(Note: `/api/households/summary` and `/api/households/monthly-trend` are explicitly registered before the parameterized `/api/households/{meter}` route — the code contains a comment explaining this is required so FastAPI's registration-order route matching treats `"summary"`/`"monthly-trend"` as their own literal endpoints rather than being captured as a `{meter}` value.)*

### 18.4 Pydantic models and result-store relationship

Every response is defined as a Pydantic `BaseModel` (e.g. `SummaryResponse`, `AnomalyRecord`, `HouseholdSummaryRecord`) — this is what gives FastAPI its automatic request/response validation and the 422 errors above for malformed input. `_clean_row()` and its record-specific wrappers (`_to_record`, `_to_household_record`, etc.) convert pandas-native values (NaN, `Timestamp`) into JSON/Pydantic-safe `None`/`date` values before constructing each response model — this conversion logic lives entirely in `api.py`, keeping `results_store.py` and `household_features.py` free of any web-framework awareness.

### 18.5 Why the API exists between ML and frontend, restated concretely

Without it, the frontend would need to either embed a Python runtime in the browser (impossible) or read `results/anomaly_results.parquet`/`data/block_0.csv` directly from a filesystem the browser cannot see. The API is the only mechanism by which a browser-based dashboard can reach data and computation that live entirely in a separate Python process.

---

## 19. Results and Validation

All figures below were re-computed directly against the actual local files at the time this report was written — not copied from any prior report.

### 19.1 Dataset-level facts

| Fact | Value | Source |
|---|---|---|
| `daily_dataset.csv.xlsx` shape | 1,048,575 rows × 9 columns | Direct read via `pandas.read_excel` |
| Unique meters (anomaly-scored population) | 1,637 | Direct read |
| Date range | 2011-11-23 to 2014-02-28 | Direct read |
| `block_0.csv` shape | 1,222,670 rows × 3 columns | Direct read |
| Unique meters (household-analytics sample) | 50 | Direct read |
| `informations_households.csv` shape | 5,566 rows × 5 columns | Direct read |

### 19.2 Feature-engineering-stage facts (from the module's own built-in validation)

Rows in / rows out is guaranteed 1:1 by design (`build_features()`'s own docstring: "no rows are added or dropped") — verifiable by inspecting the merge logic, which uses `how="left"` from the original row set. The module's own automated leakage check (`_check_no_future_leakage()`) is run every time the module is executed directly, and asserts that tampering with a meter's *latest* row never changes any of that meter's *earlier* computed features.

### 19.3 Pipeline-output-stage facts (measured directly from `results/anomaly_results.parquet`)

| Metric | Value |
|---|---|
| Total result rows | 1,048,575 |
| Total columns | 15 (`LCLid`, `day`, `energy_sum`, `expected_consumption`, `deviation`, `statistical_score`, `statistical_evidence`, `if_score`, `if_evidence`, `hybrid_score`, `anomaly_status`, `anomaly_type`, `confidence`, `is_complete_day`, `eligibility_status`) |
| Result file size on disk | ~50.4 MB (Parquet, single row group) |
| **Eligibility breakdown** | eligible: 1,021,384 · insufficient_history: 11,453 · incomplete_day: 9,912 · undefined_relative_baseline: 3,587 · gap_in_history: 2,239 |
| Statistical-detector-only eligible rows (before the Isolation-Forest-specific `undefined_relative_baseline` narrowing) | 1,024,971 (= 1,021,384 + 3,587) |
| **Total anomalies** | 5,159 (0.505% of the 1,021,384 eligible rows) |
| — Spikes | 4,489 |
| — Drops | 670 |
| Confidence: Both / Single / Combined | 3,239 / 1,920 / 0 |

*(These figures independently reproduce the exact numbers documented inside `hybrid_detector.py`'s and `isolation_forest_detector.py`'s own module docstrings — e.g. the docstring's "1,024,971 otherwise-eligible rows" and "3,587 of 1,024,971" both match exactly what a fresh read of the live results file shows, and the 4,489-row threshold table in [Section 10.5](#105-the-threshold-099-and-why-it-isnt-an-arbitrary-round-number) matches the measured spike count exactly, confirming the results file reflects the currently-documented pipeline logic.)*

### 19.4 Determinism

`pipeline.py` includes a `check_determinism()` function that runs the **entire pipeline twice from disk** and asserts the two resulting tables are exactly equal (`first.equals(second)`), relying on `random_state=42` being fixed throughout the Isolation Forest step. This check runs automatically every time `python -m src.pipeline` is executed directly and prints `PASS`/`FAIL` in its run report. **Whether this check currently passes on a fresh run was not re-executed as part of this documentation review** (re-running the full ~1M-row pipeline twice was outside the scope of a documentation task) — this is stated explicitly per this report's accuracy rules rather than assumed. The mechanism and its intent are fully verified from the code itself, whether or not it was re-run here.

### 19.5 Automated test coverage

The `tests/` directory (run via `pytest`, configured by `pytest.ini`'s `testpaths = tests`) runs against the **real** FastAPI app with its real startup lifespan, reading the actual `results/anomaly_results.parquet` and `data/*.csv` files already on disk — not mocked detector/pipeline data. Confirmed test files: `test_core_endpoints.py` (summary, anomaly list pagination, household summary, 404/422 behavior), `test_anomalies_api.py`, `test_households_api.py`, `test_ai_endpoints.py` (anomaly-explain and dashboard-explain success/404/422/503 paths, with the OpenRouter call itself monkeypatched — no real network call in any test), and `test_household_ai_endpoint.py`. `conftest.py` documents explicitly that the only thing ever mocked anywhere in the suite is the OpenRouter `complete()` call and, for the 503 test, the API key environment variable.

### 19.6 What is measured vs. what is a design decision vs. what is an assumption

To keep this section honest about its own epistemic status:

- **Measured** (re-derived directly from files in this review): every number in 19.1–19.3 above.
- **Design decisions** (chosen deliberately, with documented reasoning, not derived from a formula): the 99th-percentile statistical threshold, `contamination=0.01`, the 0.5/0.5 hybrid weighting, the 0.99 hybrid threshold, and the severe-drop override — all explained with their supporting evidence in Sections 6–11.
- **Assumptions the pipeline makes about the data**, stated explicitly rather than left implicit: that `(LCLid, day)` uniquely identifies a row; that `energy_count` reliably reflects data completeness; that a meter's trailing 7 real days are a meaningful "recent normal" (a genuinely different assumption from, say, comparing to the same weekday last month); and that the 1,637-meter and 50-meter populations should be kept strictly separate rather than merged, absent confirmed overlap.

---

## 20. Performance

### 20.1 Dataset size and the primary bottleneck

The dataset is ~1.05 million rows. `data_validation.py`'s `load_dataset()` reads it via `pandas.read_excel(..., engine="openpyxl")` — Excel/`.xlsx` parsing through `openpyxl` is markedly slower than reading an equivalent CSV or Parquet file of the same size, because `openpyxl` has to parse the workbook's internal XML structure, not just split lines of text. **This load step is the pipeline's dominant cost**, not any of the detection logic — `pipeline.py`'s own per-stage timing report (`timings["load_data"]` vs. every other stage) is specifically designed to make this visible rather than hidden inside one aggregate "total time" figure.

### 20.2 Why feature engineering is comparatively fast

`feature_engineering.py` is built entirely from **vectorized** pandas/NumPy operations — `groupby().shift()`, `sliding_window_view` for the rolling median/MAD, and array-level `np.select`/`np.where` — with no Python-level per-row loops over the ~1M rows (the one explicit Python loop, over `_rolling_median_mad`'s per-meter groups in `_history_features()`, iterates over the 1,637 *meters*, not the 1,048,575 *rows*). This is standard, well-optimized pandas usage, and is measurably much cheaper than the Excel load step.

### 20.3 Isolation Forest and hybrid runtime

`IsolationForest` is configured with `max_samples=256` per tree specifically because — as documented directly in the code — small per-tree subsamples are what keeps scoring ~1M rows fast (each of the 100 trees only ever looks at 256 rows during training, regardless of the full dataset's size); `n_jobs=-1` additionally parallelizes tree-building across available CPU cores. `hybrid_detector.py`'s work is simple vectorized rank/arithmetic operations on already-computed columns, and is the cheapest of the three detector stages.

### 20.4 Parquet performance and the cached result-store behavior

`results/anomaly_results.parquet` is ~50.4 MB for the full 1,048,575-row, 15-column results table — small enough to load into memory quickly and keep resident for the life of the API process. `results_store.py` is explicit about a deliberate performance decision: although Parquet supports predicate pushdown (`filters=` on `pd.read_parquet`, which can skip reading some data from disk based on a filter), the file is written as a **single row group**, so pushdown cannot actually skip any I/O for this file — it would still read every column value before filtering, on every call. The module's own measurement concluded that loading the file **once** into memory and filtering with plain pandas is both simpler and faster for the kind of repeated, varied queries this API serves, so that is the strategy actually used — the DataFrame is read from disk exactly once per process and reused for every subsequent request. `results_store.py` additionally converts five low-cardinality columns (`LCLid`, `anomaly_status`, `anomaly_type`, `confidence`, `eligibility_status`) to pandas' `category` dtype, which the module's own comment reports reduced deep memory usage on this dataset from ~291 MB to ~79 MB, with no change in query results.

### 20.5 API and frontend performance

Because `src/api.py`'s `lifespan` pre-loads and pre-aggregates everything once at process startup (see [Section 18.1](#181-startup-behavior)), every individual request only ever does in-memory pandas filtering/sorting/pagination — no file I/O, no re-scoring, and no ML inference happens per request. On the frontend side, every list/detail page is a Server Component that performs its `await` data fetch during server-side rendering, so the performance characteristics visible to a user are dominated by the API's own response time plus normal Next.js server-rendering overhead, not by anything ML-specific.

### 20.6 Why the bottleneck is not the ML algorithms

Put directly: reading a ~1M-row `.xlsx` workbook through `openpyxl` is inherently slower, row for row, than either (a) fitting 100 Isolation Forest trees that each only ever see 256 sampled rows, or (b) evaluating one fixed statistical formula across ~1M rows with vectorized NumPy arithmetic. The ML/statistics stages are, by construction, the cheap part of this pipeline; the file-format choice for the *input* data is the expensive part. *(Exact wall-clock timing figures for a specific machine were not re-captured as part of this documentation review, since `pipeline.py` prints its own live timing report on every run rather than storing timing results to a file this review could read; the qualitative ordering above — Excel load > everything else — is confirmed directly from the code's own design comments and the mechanisms described above, not from a specific timed run.)*

---

## 21. Limitations

Stated plainly and honestly, distinguishing what is confirmed from the project itself versus general production considerations.

**Confirmed, project-specific limitations:**

- **No ground-truth anomaly labels exist anywhere in the datasets.** Every threshold and design decision in this project (the 99th percentile, `contamination=0.01`, the 0.99 hybrid cutoff) was chosen by inspecting the *internal consistency* of the two detectors' agreement with each other — never validated against a confirmed "this really was an anomaly" label, because no such label exists locally.
- **Threshold selection is evidence-based but not accuracy-validated.** The thresholds are well-reasoned and extensively documented (Sections 6–11), but "well-reasoned" is not the same claim as "measured against ground truth," which this project cannot do with the data it has.
- **Isolation Forest is measurably weak at ranking drop severity** — correlation with the statistical detector's drop-side ranking is ~0.13, essentially none (see [Section 11.2](#112-why-this-happened)). This is why drops rely on the separate severe-drop override rather than the main hybrid threshold.
- **A handful of low/intermittent-consumption meters dominate the severe-drop override** — one meter alone contributes 32 of the 670 override-admitted drop rows, meaning drop coverage is somewhat concentrated rather than evenly spread across meters.
- **Zero-MAD / near-zero-baseline behavior produces mathematically extreme scores by design** (`±infinity` in the statistical detector; excluded ratios in Isolation Forest) — a correct and deliberate mathematical treatment, but one that means a meter with genuinely little historical variability can look extremely "anomalous" on any subsequent change, however small in absolute terms.
- **Calendar gaps make a meter temporarily unscoreable**, not wrong — but they do reduce effective coverage: 2,239 rows currently fall into `gap_in_history`.
- **The 50-meter household-analytics sample has no confirmed overlap with the 1,637-meter anomaly-scored population** — the project's own code treats this as an open question, not a resolved one, and deliberately never merges figures from the two.
- **The source dataset itself is confirmed truncated**: `daily_dataset.csv.xlsx` contains exactly one row below Excel's hard worksheet limit, and no complete source file exists locally — this is a genuine, documented coverage limitation of the underlying data, not something the pipeline can correct.
- **AI hallucination risk is real and only partially mitigated** by prompt-level grounding rules — it is not eliminated (see [Section 13.6](#136-limitations-stated-plainly)).
- **This is a local-only architecture with a static dataset** — no new data has ever flowed into this system since the local files were placed in `data/`; nothing here has been tested against a live or growing dataset.

**General production considerations** (not implemented here, and not claimed to be — listed for completeness, matching [Section 15](#15-why-this-is-a-proof-of-concept-poc)): no model monitoring, no data drift detection, no production alerting, and no feedback/labeling loop currently exist in this codebase.

---

## 22. End-to-End Walkthroughs

Both examples below are **real rows from the actual generated results file and the actual raw dataset**, selected and traced through by hand for this report — every number below was independently recomputed from the raw data and cross-checked against the corresponding value already stored in `results/anomaly_results.parquet`.

### 22.1 Walkthrough 1 — a Spike (meter `MAC001348`, day `2013-04-02`)

**Step 1 — Raw data.** This meter's raw daily records around the event (`energy_sum`, kWh):

| Day | `energy_sum` | `energy_count` |
|---|---|---|
| 2013-03-26 | 52.984 | 48 |
| 2013-03-27 | 42.082 | 48 |
| 2013-03-28 | 52.704 | 48 |
| 2013-03-29 | 0.010 | 48 |
| 2013-03-30 | 0.000 | 48 |
| 2013-03-31 | 0.000 | 48 |
| 2013-04-01 | 0.000 | 48 |
| **2013-04-02** | **62.484** | **48** |

The household used a moderate, fairly steady amount of electricity, then appears to have gone unused for four days (2013-03-29 through 2013-04-01 — a plausible vacancy or an appliance/circuit being switched off), then jumped back to a higher-than-usual 62.484 kWh on 2013-04-02.

**Step 2 — Validation.** Every row above has `energy_count == 48`, so every day is a *complete* day (`is_complete_day = True`) — none of this sequence is excluded for data-quality reasons.

**Step 3 — Feature engineering.** The trailing 7 real days before 2013-04-02 are 2013-03-26 through 2013-04-01: `[52.984, 42.082, 52.704, 0.010, 0.000, 0.000, 0.000]`.

- Sorted: `[0.000, 0.000, 0.000, 0.010, 42.082, 52.704, 52.984]` → **`rolling_7d_median = 0.010`** (the 4th of 7 values).
- Absolute deviations from 0.010: `[0.010, 0.010, 0.010, 0.000, 42.072, 52.694, 52.974]` → sorted: `[0.000, 0.010, 0.010, 0.010, 42.072, 52.694, 52.974]` → **`rolling_7d_mad = 0.010`** (the 4th of 7 values).
- **`deviation_from_rolling_median` = 62.484 − 0.010 = 62.474.**

**Step 4 — Statistical score.** `robust_score = 0.6745 × 62.474 / 0.010 = 4,213.87` — an enormous modified z-score, since the recent baseline happened to sit right near zero (dominated by the four zero-usage days) while today jumped to 62+ kWh. This matches the value actually stored in the results file exactly (**4,213.871327**).

**Step 5 — Isolation Forest features.** `relative_deviation = 62.474 / 0.010 = 6,247.4` (an extreme relative jump). `relative_mad = 0.010 / 0.010 = 1.0`.

**Step 6 — Isolation Forest score.** The stored `if_score = 0.132176`, and `if_evidence` (its percentile rank among eligible rows) `= 0.999955` — this row is at essentially the very top of the Isolation Forest's own ranking, confirming the extreme relative-deviation value made it genuinely easy to isolate.

**Step 7 — Hybrid score.** `statistical_evidence = 0.999764` (this row's rank among `|robust_score|` values). `hybrid_score = 0.5 × 0.999764 + 0.5 × 0.999955 = 0.999860` — comfortably above the 0.99 threshold.

**Step 8 — Final decision.** `hybrid_score ≥ 0.99` → `is_hybrid_anomaly = True` → `anomaly_status = "Anomaly"`. `deviation > 0` → `anomaly_type = "Spike"`. Both individual detectors independently flagged this row (`is_statistical_anomaly = True` and `is_if_anomaly = True`) → `confidence = "Both"`.

**Step 9 — API.** A dashboard request to `GET /api/anomalies/MAC001348/2013-04-02` (or a row within `GET /api/anomalies`) returns exactly this record as an `AnomalyRecord`.

**Step 10 — Dashboard.** The anomaly appears in the Anomaly Explorer's list (sorted to the very top by `hybrid_score`, the default sort), and its detail page (`/anomalies/MAC001348/2013-04-02`) plots it against the meter's own consumption-vs-expected history.

**Step 11 — AI analysis.** Opening the floating AI Analyst on that detail page sends the anomaly's own record, a ±14-day history window, and the household's tariff/ACORN context to `POST /api/ai/anomalies/MAC001348/2013-04-02/explain`. The model is instructed to describe, in plain language and grounded strictly in that data, that this was flagged as a large spike far above the meter's own recent baseline — **without** asserting a specific cause, since none is present in the supplied data.

### 22.2 Walkthrough 2 — a Drop (meter `MAC002224`, day `2012-12-29`)

**Step 1 — Raw data.**

| Day | `energy_sum` | `energy_count` |
|---|---|---|
| 2012-12-22 | 0.000 | 48 |
| 2012-12-23 | 0.000 | 48 |
| 2012-12-24 | 0.012 | 48 |
| 2012-12-25 | 0.013 | 48 |
| 2012-12-26 | 0.012 | 48 |
| 2012-12-27 | 0.012 | 48 |
| 2012-12-28 | 0.012 | 48 |
| **2012-12-29** | **0.000** | **48** |

This is a meter with an extremely low, essentially near-zero baseline consumption pattern (consistent with a largely vacant or minimally-used property) — small, sub-kWh values hovering around 0.012 most days, occasionally exactly 0.

**Step 2 — Validation.** All rows have `energy_count == 48` — complete days throughout.

**Step 3 — Feature engineering.** Trailing 7 days before 2012-12-29: `[0.000, 0.000, 0.012, 0.013, 0.012, 0.012, 0.012]`.

- Sorted: `[0.000, 0.000, 0.012, 0.012, 0.012, 0.012, 0.013]` → **`rolling_7d_median = 0.012`**.
- Absolute deviations from 0.012: `[0.012, 0.012, 0.000, 0.001, 0.000, 0.000, 0.000]` → sorted: `[0.000, 0.000, 0.000, 0.000, 0.001, 0.012, 0.012]` → **`rolling_7d_mad = 0.000`** — this trailing week is, for MAD purposes, effectively flat.
- **`deviation_from_rolling_median` = 0.000 − 0.012 = −0.012.**

**Step 4 — Statistical score.** This is exactly the **zero-MAD, broke-the-flat-baseline** case from [Section 6.5](#65-edge-cases--exactly-how-the-code-handles-each-one): `rolling_7d_mad ≈ 0` and today's deviation (−0.012) is nonzero, so `robust_score = sign(deviation) × ∞ = −∞`. This matches the results file exactly (`statistical_score = -inf`) — the strongest possible statistical evidence of an unusual drop.

**Step 5 — Isolation Forest features.** `relative_deviation = −0.012 / 0.012 = −1.0` — sitting exactly at the mathematical floor described in [Section 11.2](#112-why-this-happened) (consumption cannot go below zero, so a total collapse to zero against *any* positive baseline always produces exactly −1.0). `relative_mad = 0.000 / 0.012 = 0.0`.

**Step 6 — Isolation Forest score.** Stored `if_score = −0.052315`, `if_evidence = 0.979109`. High, but **not** high enough to reach the 0.99 territory needed to help clear the hybrid threshold on its own — exactly the pattern [Section 11.2](#112-why-this-happened) documents: a "flat-near-zero-baseline collapses to exactly zero" pattern is common across many low-consumption meters, so it does not register as maximally rare to Isolation Forest the way it does to the statistical detector.

**Step 7 — Hybrid score.** `statistical_evidence = 0.999891` (the `−∞` score ranks at virtually the top of all statistical evidence). `hybrid_score = 0.5 × 0.999891 + 0.5 × 0.979109 = 0.9895` — **below** the 0.99 hybrid threshold, so `is_hybrid_anomaly = False` on its own.

**Step 8 — Final decision, via the severe-drop override.** Because `eligibility_status == "eligible"`, `deviation < 0`, and `is_statistical_anomaly == True`, this row qualifies as `is_severe_drop = True`, and `is_anomaly = is_hybrid_anomaly OR is_severe_drop = True`. `anomaly_status = "Anomaly"`, `anomaly_type = "Drop"` (`deviation < 0`). Only the statistical detector independently flagged it (`is_statistical_anomaly = True`, `is_if_anomaly` in this case is `False`, since 0.9895 alone is below IF's own contamination-based decision cutoff for this row) → `confidence = "Single"`.

**Step 9 — Why the system treats this differently from the spike.** The spike in Walkthrough 1 cleared the *hybrid threshold itself* — both detectors independently agreed it was extreme. This drop only becomes a flagged anomaly because of the dedicated severe-drop override described in [Section 11.4](#114-the-adopted-solution-a-severe-drop-override), which exists specifically because Isolation Forest's own ranking does not reliably track drop severity, and without the override this genuinely severe drop (`robust_score = −∞`) would have been missed entirely by the hybrid threshold alone.

**Step 10 — API, dashboard, AI.** Exactly the same mechanics as Walkthrough 1: `GET /api/anomalies/MAC002224/2012-12-29` returns this record, it appears in the Anomaly Explorer tagged `Drop`, and its detail page's AI Analyst panel would describe — grounded strictly in this data — that consumption collapsed to zero against a baseline that was already very low and essentially flat, without asserting why.

---

## 23. Why Each Technology Exists

Only technologies actually present in the repository are listed.

| Technology | Why this project uses it |
|---|---|
| **Python** | The language for the entire data/ML/API layer — dominant ecosystem for pandas/NumPy/scikit-learn-based data work |
| **Pandas** | The DataFrame library every stage of the pipeline is built on — loading, grouping, joining, rolling windows, and the in-memory query layer in `results_store.py` |
| **NumPy** | Underlies pandas' vectorized array math; used directly for `sliding_window_view` (the rolling median/MAD implementation) and `np.select`/`np.where` conditional logic throughout the detectors |
| **openpyxl** | The engine pandas uses to read the `.xlsx` source file (`daily_dataset.csv.xlsx`) |
| **scikit-learn** | Supplies the `IsolationForest` implementation used in `isolation_forest_detector.py` — the project's one genuine machine-learning component |
| **Isolation Forest** (specific algorithm) | Chosen as an unsupervised, meter-relative "how rare is this point" signal to complement the formula-based statistical detector — see [Sections 7](#7-isolation-forest)–[8](#8-why-two-detectors) for the full reasoning |
| **pyarrow** | The Parquet engine used to read/write `results/anomaly_results.parquet` — a compact, dtype-preserving columnar format, faster to read/write repeatedly than CSV at this row count |
| **FastAPI** | The web framework serving every HTTP endpoint (`src/api.py`) — chosen for its built-in request/response validation via Pydantic and its async-friendly `lifespan` startup hook, used here to pre-load results once |
| **uvicorn** | The ASGI server that actually runs the FastAPI application (`uvicorn src.api:app`) |
| **python-dotenv** | Loads the local `.env` file's environment variables (`OPENROUTER_API_KEY`, `FRONTEND_ORIGINS`) into the process at `api.py` import time |
| **Pydantic** | Defines and validates every API request/response model, and is what produces automatic 422 errors on malformed input |
| **Next.js** | The frontend framework — provides the App Router, Server Components (for direct server-side data fetching), and the dev/build tooling the dashboard is built on |
| **React** | The UI library Next.js is built on; every component in `frontend/` (server or client) is a React component |
| **TypeScript** | Used throughout the frontend for type safety — `lib/types.ts` mirrors the backend's Pydantic models by hand so a mismatch is caught at compile time, not silently at runtime |
| **Tailwind CSS** | The utility-class CSS framework used for all styling in `frontend/app/globals.css` and every component's `className` usage |
| **Recharts** | The charting library (confirmed in `frontend/package.json`) used for the monthly-trend, meter-history, and household-consumption charts |
| **Vitest** | The frontend's unit-testing framework, used for `lib`/`components` tests (`npm run test`) |
| **pytest** | The backend's test framework (`tests/`, run against the real FastAPI app) |
| **httpx** | Used by FastAPI's `TestClient` under the hood for the backend test suite |
| **OpenRouter + `openai/gpt-4o-mini`** | The external LLM provider/model powering every "AI Analyst" feature — a single hosted API call per request, with no self-hosted model or fine-tuning involved |

---

## 24. Explain This Project to Me in 5 Minutes

This project takes a large table of daily household electricity readings, works out — for every single household, on every single day — what that specific household's own "normal" recent pattern looks like, and flags the days that don't fit that pattern, either because usage spiked far above normal or collapsed far below it. It does this with two independently-built detectors: a transparent statistical formula, and a small unsupervised machine-learning model, then combines their opinions into one final, ranked list. Every flagged day, plus the numbers behind why it was flagged, is served through a web API to a browser dashboard, where an optional AI layer can turn the raw numbers into a short, plain-language explanation — without ever pretending to know *why* it happened, only *what the data shows*.

### If you remember only 10 things

1. Every anomaly is judged **relative to that specific meter's own recent history** — never by comparing raw kWh across different households.
2. The baseline for "today" is always built from the **previous 7 real days only**, strictly excluding today itself, to avoid leaking today's own value into its own yardstick.
3. There are genuinely **two separate datasets/populations** in this project: the 1,637-meter anomaly-scored population, and an unrelated 50-meter consumption-analytics sample — the code deliberately never merges their figures.
4. The **statistical detector** is a fixed, fully hand-verifiable formula (`0.6745 × deviation / MAD`) — not machine learning.
5. The **Isolation Forest detector** is the project's one true machine-learning component, trained on two *relative* (not raw-kWh) ratio features specifically because raw kWh features were measured to unfairly over-flag high-consumption meters.
6. The two detectors disagree on most of what they individually flag (~19% overlap) — which is exactly why combining them adds real value instead of duplicating one signal.
7. Both detectors' scores are converted to **percentile ranks** before being averaged 50/50, because their raw scores are on completely incompatible scales (one can literally be infinite).
8. **Drops needed a special-case rule** (the severe-drop override) because Isolation Forest, by design, does not reliably rank how severe a drop is — a real, measured, and documented limitation, not an oversight.
9. The **AI layer never detects anything** — it only explains, in plain language, results the deterministic pipeline already computed, and is explicitly instructed never to invent a cause.
10. This is a **local-only proof of concept**: no database, no authentication, no cloud infrastructure, and no ground-truth labels — all real, stated limitations, not hidden ones.

### One-sentence architecture

A static local dataset is validated, turned into meter-relative features, scored by two independent detectors whose outputs are combined into one ranked anomaly list, persisted to a local file, served over a FastAPI backend, and displayed — with an optional AI-generated plain-language explanation on top — by a Next.js dashboard that never touches the raw data itself.

### One-sentence ML explanation

An unsupervised Isolation Forest model learns, from unlabeled data, which combinations of "how far today deviates from a meter's own baseline" and "how volatile that meter normally is" look rare, complementing (not replacing) a transparent statistical formula that measures the same kind of deviation a different, fully explainable way.

### One-sentence AI explanation

A large language model, given only the already-detected numbers for one specific anomaly or household and explicit instructions never to invent facts or causes, turns that structured data into a short, plain-language explanation a non-technical dashboard user can read at a glance.

### One-sentence business value explanation

Instead of a person having to manually scan over a million rows of meter readings, this system automatically surfaces the roughly 5,000 household-days that genuinely look unusual relative to each household's own history, ranked by how confident two independent methods are, with a plain-language explanation attached — turning an impossible manual review task into a short, prioritized list an analyst can actually act on.
