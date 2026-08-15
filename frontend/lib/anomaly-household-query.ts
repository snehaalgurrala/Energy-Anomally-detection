// Parses/serializes the "Households with Notable Anomaly Activity" table's
// URL query state. Mirrors lib/household-query.ts's shape, but every param
// is `hh_`-prefixed since this table lives on the same /anomalies page as
// the existing anomaly explorer (lib/anomaly-query.ts), which already owns
// the unprefixed `sort_by`/`page`/etc. names.

import type { HighAnomalySortColumn } from "./types";

export interface AnomalyHouseholdQueryState {
  sort_by: HighAnomalySortColumn;
  ascending: boolean;
  page: number;
  page_size: number;
}

export const ANOMALY_HOUSEHOLD_QUERY_DEFAULTS: AnomalyHouseholdQueryState = {
  sort_by: "anomaly_count",
  ascending: false,
  page: 1,
  page_size: 10,
};

const SORT_COLUMNS: readonly HighAnomalySortColumn[] = [
  "anomaly_count",
  "spike_count",
  "drop_count",
  "anomaly_rate_pct",
  "avg_hybrid_score",
  "max_hybrid_score",
  "latest_anomaly_date",
];

function isSortColumn(value: string | undefined): value is HighAnomalySortColumn {
  return !!value && (SORT_COLUMNS as readonly string[]).includes(value);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export type RawSearchParams = { [key: string]: string | string[] | undefined };

export function parseAnomalyHouseholdQuery(raw: RawSearchParams): AnomalyHouseholdQueryState {
  const sortBy = first(raw.hh_sort_by);
  return {
    sort_by: isSortColumn(sortBy) ? sortBy : ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.sort_by,
    ascending: first(raw.hh_ascending) === "true",
    page: toPositiveInt(first(raw.hh_page), ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.page),
    page_size: toPositiveInt(first(raw.hh_page_size), ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.page_size),
  };
}

export function toApiParams(state: AnomalyHouseholdQueryState) {
  return {
    sort_by: state.sort_by,
    ascending: state.ascending,
    page: state.page,
    page_size: state.page_size,
  };
}

/**
 * Builds the /anomalies href for `state` with `changes` applied, preserving
 * every other current query param (the explorer's own filters included) so
 * the two tables on the page don't clobber each other's URL state. Any
 * change other than an explicit `page` resets this table's pagination back
 * to page 1.
 */
export function buildAnomalyHouseholdHref(
  currentSearch: string,
  state: AnomalyHouseholdQueryState,
  changes: Partial<AnomalyHouseholdQueryState>,
): string {
  const next: AnomalyHouseholdQueryState = { ...state, ...changes };
  if (!("page" in changes)) next.page = 1;

  const params = new URLSearchParams(currentSearch);
  if (next.sort_by !== ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.sort_by) params.set("hh_sort_by", next.sort_by);
  else params.delete("hh_sort_by");
  if (next.ascending !== ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.ascending) {
    params.set("hh_ascending", String(next.ascending));
  } else {
    params.delete("hh_ascending");
  }
  if (next.page !== ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.page) params.set("hh_page", String(next.page));
  else params.delete("hh_page");
  if (next.page_size !== ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.page_size) {
    params.set("hh_page_size", String(next.page_size));
  } else {
    params.delete("hh_page_size");
  }

  const qs = params.toString();
  return `/anomalies${qs ? `?${qs}` : ""}`;
}
