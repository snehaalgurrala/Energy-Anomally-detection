import { describe, expect, it } from "vitest";
import {
  ANOMALY_QUERY_DEFAULTS,
  buildAnomaliesHref,
  parseAnomalyQuery,
  toApiParams,
  type AnomalyQueryState,
} from "../anomaly-query";

describe("parseAnomalyQuery", () => {
  it("returns defaults when nothing is present", () => {
    expect(parseAnomalyQuery({})).toEqual(ANOMALY_QUERY_DEFAULTS);
  });

  it("parses filters, sort, and pagination from raw params", () => {
    expect(
      parseAnomalyQuery({
        meter: "MAC0001",
        anomaly_type: "spike",
        start_date: "2013-01-01",
        end_date: "2013-02-01",
        sort_by: "deviation",
        ascending: "true",
        page: "3",
        page_size: "25",
      }),
    ).toEqual({
      meter: "MAC0001",
      anomaly_type: "spike",
      start_date: "2013-01-01",
      end_date: "2013-02-01",
      sort_by: "deviation",
      ascending: true,
      page: 3,
      page_size: 25,
    });
  });

  it("takes the first value when a param repeats", () => {
    expect(parseAnomalyQuery({ meter: ["MAC0001", "MAC0002"] }).meter).toBe("MAC0001");
  });

  it("falls back to the default sort column when given an unknown one", () => {
    expect(parseAnomalyQuery({ sort_by: "not_a_column" }).sort_by).toBe(
      ANOMALY_QUERY_DEFAULTS.sort_by,
    );
  });

  it("falls back to default page/page_size for non-positive or non-integer values", () => {
    expect(parseAnomalyQuery({ page: "0" }).page).toBe(ANOMALY_QUERY_DEFAULTS.page);
    expect(parseAnomalyQuery({ page: "-1" }).page).toBe(ANOMALY_QUERY_DEFAULTS.page);
    expect(parseAnomalyQuery({ page: "abc" }).page).toBe(ANOMALY_QUERY_DEFAULTS.page);
    expect(parseAnomalyQuery({ page_size: "2.5" }).page_size).toBe(
      ANOMALY_QUERY_DEFAULTS.page_size,
    );
  });
});

describe("toApiParams", () => {
  it("converts empty-string filters to undefined", () => {
    const state: AnomalyQueryState = { ...ANOMALY_QUERY_DEFAULTS };
    expect(toApiParams(state)).toEqual({
      meter: undefined,
      anomaly_type: undefined,
      start_date: undefined,
      end_date: undefined,
      sort_by: "hybrid_score",
      ascending: false,
      page: 1,
      page_size: 10,
    });
  });

  it("passes non-empty filters through unchanged", () => {
    const state: AnomalyQueryState = { ...ANOMALY_QUERY_DEFAULTS, meter: "MAC0001" };
    expect(toApiParams(state).meter).toBe("MAC0001");
  });
});

describe("buildAnomaliesHref", () => {
  it("omits params that are still at their default value", () => {
    expect(buildAnomaliesHref(ANOMALY_QUERY_DEFAULTS, {})).toBe("/anomalies");
  });

  it("includes changed filters, sort, and page_size in the query string", () => {
    const href = buildAnomaliesHref(ANOMALY_QUERY_DEFAULTS, {
      meter: "MAC0001",
      sort_by: "deviation",
      ascending: true,
      page_size: 25,
    });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("meter")).toBe("MAC0001");
    expect(params.get("sort_by")).toBe("deviation");
    expect(params.get("ascending")).toBe("true");
    expect(params.get("page_size")).toBe("25");
  });

  it("resets page to 1 when a non-page change is applied", () => {
    const state: AnomalyQueryState = { ...ANOMALY_QUERY_DEFAULTS, page: 5 };
    const href = buildAnomaliesHref(state, { meter: "MAC0001" });
    expect(new URLSearchParams(href.split("?")[1]).get("page")).toBeNull();
  });

  it("preserves an explicit page change instead of resetting it", () => {
    const href = buildAnomaliesHref(ANOMALY_QUERY_DEFAULTS, { page: 4 });
    expect(new URLSearchParams(href.split("?")[1]).get("page")).toBe("4");
  });

  it("keeps other current state when only page changes", () => {
    const state: AnomalyQueryState = { ...ANOMALY_QUERY_DEFAULTS, meter: "MAC0001", page: 2 };
    const href = buildAnomaliesHref(state, { page: 3 });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("meter")).toBe("MAC0001");
    expect(params.get("page")).toBe("3");
  });
});
