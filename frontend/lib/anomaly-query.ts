// Parses/serializes the anomaly explorer's URL query state. Centralized here
// so the page (parsing), filters, and pagination (both building hrefs) share
// one implementation instead of each re-deriving query strings.

import type { AnomalyListParams, SortColumn } from "./types";

export interface AnomalyQueryState {
  meter: string;
  anomaly_type: string;
  start_date: string;
  end_date: string;
  sort_by: SortColumn;
  ascending: boolean;
  page: number;
  page_size: number;
}

export const ANOMALY_QUERY_DEFAULTS: AnomalyQueryState = {
  meter: "",
  anomaly_type: "",
  start_date: "",
  end_date: "",
  sort_by: "hybrid_score",
  ascending: false,
  page: 1,
  page_size: 50,
};

const SORT_COLUMNS: readonly SortColumn[] = [
  "hybrid_score",
  "statistical_score",
  "if_score",
  "deviation",
  "day",
];

function isSortColumn(value: string | undefined): value is SortColumn {
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

export function parseAnomalyQuery(raw: RawSearchParams): AnomalyQueryState {
  const sortBy = first(raw.sort_by);
  return {
    meter: first(raw.meter) ?? ANOMALY_QUERY_DEFAULTS.meter,
    anomaly_type: first(raw.anomaly_type) ?? ANOMALY_QUERY_DEFAULTS.anomaly_type,
    start_date: first(raw.start_date) ?? ANOMALY_QUERY_DEFAULTS.start_date,
    end_date: first(raw.end_date) ?? ANOMALY_QUERY_DEFAULTS.end_date,
    sort_by: isSortColumn(sortBy) ? sortBy : ANOMALY_QUERY_DEFAULTS.sort_by,
    ascending: first(raw.ascending) === "true",
    page: toPositiveInt(first(raw.page), ANOMALY_QUERY_DEFAULTS.page),
    page_size: toPositiveInt(first(raw.page_size), ANOMALY_QUERY_DEFAULTS.page_size),
  };
}

export function toApiParams(state: AnomalyQueryState): AnomalyListParams {
  return {
    meter: state.meter || undefined,
    anomaly_type: state.anomaly_type || undefined,
    start_date: state.start_date || undefined,
    end_date: state.end_date || undefined,
    sort_by: state.sort_by,
    ascending: state.ascending,
    page: state.page,
    page_size: state.page_size,
  };
}

/**
 * Builds the /anomalies href for `state` with `changes` applied. Any change
 * other than an explicit `page` resets pagination back to page 1, since the
 * result set underneath the current page number has shifted.
 */
export function buildAnomaliesHref(
  state: AnomalyQueryState,
  changes: Partial<AnomalyQueryState>,
): string {
  const next: AnomalyQueryState = { ...state, ...changes };
  if (!("page" in changes)) next.page = 1;

  const params = new URLSearchParams();
  if (next.meter) params.set("meter", next.meter);
  if (next.anomaly_type) params.set("anomaly_type", next.anomaly_type);
  if (next.start_date) params.set("start_date", next.start_date);
  if (next.end_date) params.set("end_date", next.end_date);
  if (next.sort_by !== ANOMALY_QUERY_DEFAULTS.sort_by) params.set("sort_by", next.sort_by);
  if (next.ascending !== ANOMALY_QUERY_DEFAULTS.ascending) {
    params.set("ascending", String(next.ascending));
  }
  if (next.page !== ANOMALY_QUERY_DEFAULTS.page) params.set("page", String(next.page));
  if (next.page_size !== ANOMALY_QUERY_DEFAULTS.page_size) {
    params.set("page_size", String(next.page_size));
  }

  const qs = params.toString();
  return `/anomalies${qs ? `?${qs}` : ""}`;
}
