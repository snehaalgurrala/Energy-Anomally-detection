import { describe, expect, it } from "vitest";
import {
  ANOMALY_HOUSEHOLD_QUERY_DEFAULTS,
  buildAnomalyHouseholdHref,
  parseAnomalyHouseholdQuery,
  toApiParams,
  type AnomalyHouseholdQueryState,
} from "../anomaly-household-query";

describe("parseAnomalyHouseholdQuery", () => {
  it("returns defaults when nothing is present", () => {
    expect(parseAnomalyHouseholdQuery({})).toEqual(ANOMALY_HOUSEHOLD_QUERY_DEFAULTS);
  });

  it("parses the hh_-prefixed params", () => {
    expect(
      parseAnomalyHouseholdQuery({
        hh_sort_by: "spike_count",
        hh_ascending: "true",
        hh_page: "2",
        hh_page_size: "20",
      }),
    ).toEqual({
      sort_by: "spike_count",
      ascending: true,
      page: 2,
      page_size: 20,
    });
  });

  it("falls back to the default sort column when given an unknown one", () => {
    expect(parseAnomalyHouseholdQuery({ hh_sort_by: "not_a_column" }).sort_by).toBe(
      ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.sort_by,
    );
  });

  it("is not confused by the unprefixed anomaly-explorer params", () => {
    expect(parseAnomalyHouseholdQuery({ sort_by: "deviation", page: "9" })).toEqual(
      ANOMALY_HOUSEHOLD_QUERY_DEFAULTS,
    );
  });
});

describe("toApiParams", () => {
  it("passes state through unchanged (no filters to normalize)", () => {
    expect(toApiParams(ANOMALY_HOUSEHOLD_QUERY_DEFAULTS)).toEqual(ANOMALY_HOUSEHOLD_QUERY_DEFAULTS);
  });
});

describe("buildAnomalyHouseholdHref", () => {
  it("omits hh_ params that are still at their default value", () => {
    expect(buildAnomalyHouseholdHref("", ANOMALY_HOUSEHOLD_QUERY_DEFAULTS, {})).toBe("/anomalies");
  });

  it("preserves the anomaly explorer's own query params untouched", () => {
    const href = buildAnomalyHouseholdHref(
      "?meter=MAC0001&sort_by=deviation",
      ANOMALY_HOUSEHOLD_QUERY_DEFAULTS,
      { sort_by: "spike_count" },
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("meter")).toBe("MAC0001");
    expect(params.get("sort_by")).toBe("deviation");
    expect(params.get("hh_sort_by")).toBe("spike_count");
  });

  it("deletes hh_ params from the current search once they return to default", () => {
    const href = buildAnomalyHouseholdHref(
      "?hh_sort_by=spike_count&hh_page=3",
      { ...ANOMALY_HOUSEHOLD_QUERY_DEFAULTS, sort_by: "spike_count", page: 3 },
      { sort_by: ANOMALY_HOUSEHOLD_QUERY_DEFAULTS.sort_by, page: 1 },
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.has("hh_sort_by")).toBe(false);
    expect(params.has("hh_page")).toBe(false);
  });

  it("resets hh_page to 1 (omitted) when a non-page change is applied", () => {
    const state: AnomalyHouseholdQueryState = { ...ANOMALY_HOUSEHOLD_QUERY_DEFAULTS, page: 5 };
    const href = buildAnomalyHouseholdHref("?hh_page=5", state, { sort_by: "drop_count" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.has("hh_page")).toBe(false);
    expect(params.get("hh_sort_by")).toBe("drop_count");
  });

  it("preserves an explicit hh_page change instead of resetting it", () => {
    const href = buildAnomalyHouseholdHref("", ANOMALY_HOUSEHOLD_QUERY_DEFAULTS, { page: 4 });
    expect(new URLSearchParams(href.split("?")[1]).get("hh_page")).toBe("4");
  });
});
