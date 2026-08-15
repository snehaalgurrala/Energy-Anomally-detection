// Parses/serializes the household explorer's URL query state. Centralized
// here so the page (parsing), filters, and pagination (both building hrefs)
// share one implementation instead of each re-deriving query strings.
// Mirrors lib/anomaly-query.ts for the household explorer.

import type { HouseholdListParams, HouseholdSortColumn } from "./types";

export interface HouseholdQueryState {
  stdorToU: string;
  Acorn_grouped: string;
  sort_by: HouseholdSortColumn;
  ascending: boolean;
  page: number;
  page_size: number;
}

export const HOUSEHOLD_QUERY_DEFAULTS: HouseholdQueryState = {
  stdorToU: "",
  Acorn_grouped: "",
  sort_by: "LCLid",
  ascending: true,
  page: 1,
  page_size: 10,
};

const SORT_COLUMNS: readonly HouseholdSortColumn[] = [
  "LCLid",
  "average_daily_consumption",
  "median_daily_consumption",
  "max_daily_consumption",
  "minimum_daily_consumption",
  "consumption_std",
  "consumption_variability",
  "average_weekday_consumption",
  "average_weekend_consumption",
  "weekend_vs_weekday_ratio",
];

function isSortColumn(value: string | undefined): value is HouseholdSortColumn {
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

export function parseHouseholdQuery(raw: RawSearchParams): HouseholdQueryState {
  const sortBy = first(raw.sort_by);
  return {
    stdorToU: first(raw.stdorToU) ?? HOUSEHOLD_QUERY_DEFAULTS.stdorToU,
    Acorn_grouped: first(raw.Acorn_grouped) ?? HOUSEHOLD_QUERY_DEFAULTS.Acorn_grouped,
    sort_by: isSortColumn(sortBy) ? sortBy : HOUSEHOLD_QUERY_DEFAULTS.sort_by,
    ascending: first(raw.ascending) !== "false",
    page: toPositiveInt(first(raw.page), HOUSEHOLD_QUERY_DEFAULTS.page),
    page_size: toPositiveInt(first(raw.page_size), HOUSEHOLD_QUERY_DEFAULTS.page_size),
  };
}

export function toApiParams(state: HouseholdQueryState): HouseholdListParams {
  return {
    stdorToU: state.stdorToU || undefined,
    Acorn_grouped: state.Acorn_grouped || undefined,
    sort_by: state.sort_by,
    ascending: state.ascending,
    page: state.page,
    page_size: state.page_size,
  };
}

/**
 * Builds the /households href for `state` with `changes` applied. Any change
 * other than an explicit `page` resets pagination back to page 1, since the
 * result set underneath the current page number has shifted.
 */
export function buildHouseholdsHref(
  state: HouseholdQueryState,
  changes: Partial<HouseholdQueryState>,
): string {
  const next: HouseholdQueryState = { ...state, ...changes };
  if (!("page" in changes)) next.page = 1;

  const params = new URLSearchParams();
  if (next.stdorToU) params.set("stdorToU", next.stdorToU);
  if (next.Acorn_grouped) params.set("Acorn_grouped", next.Acorn_grouped);
  if (next.sort_by !== HOUSEHOLD_QUERY_DEFAULTS.sort_by) params.set("sort_by", next.sort_by);
  if (next.ascending !== HOUSEHOLD_QUERY_DEFAULTS.ascending) {
    params.set("ascending", String(next.ascending));
  }
  if (next.page !== HOUSEHOLD_QUERY_DEFAULTS.page) params.set("page", String(next.page));
  if (next.page_size !== HOUSEHOLD_QUERY_DEFAULTS.page_size) {
    params.set("page_size", String(next.page_size));
  }

  const qs = params.toString();
  return `/households${qs ? `?${qs}` : ""}`;
}
