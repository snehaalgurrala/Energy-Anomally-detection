import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_QUERY_DEFAULTS,
  buildHouseholdsHref,
  parseHouseholdQuery,
  toApiParams,
  type HouseholdQueryState,
} from "../household-query";

describe("parseHouseholdQuery", () => {
  it("returns defaults when nothing is present", () => {
    expect(parseHouseholdQuery({})).toEqual(HOUSEHOLD_QUERY_DEFAULTS);
  });

  it("parses filters, sort, and pagination from raw params", () => {
    expect(
      parseHouseholdQuery({
        stdorToU: "ToU",
        Acorn_grouped: "Affluent",
        sort_by: "average_daily_consumption",
        ascending: "false",
        page: "2",
        page_size: "50",
      }),
    ).toEqual({
      stdorToU: "ToU",
      Acorn_grouped: "Affluent",
      sort_by: "average_daily_consumption",
      ascending: false,
      page: 2,
      page_size: 50,
    });
  });

  it("defaults ascending to true unless explicitly 'false'", () => {
    expect(parseHouseholdQuery({}).ascending).toBe(true);
    expect(parseHouseholdQuery({ ascending: "anything-else" }).ascending).toBe(true);
    expect(parseHouseholdQuery({ ascending: "false" }).ascending).toBe(false);
  });

  it("falls back to the default sort column when given an unknown one", () => {
    expect(parseHouseholdQuery({ sort_by: "not_a_column" }).sort_by).toBe(
      HOUSEHOLD_QUERY_DEFAULTS.sort_by,
    );
  });

  it("falls back to default page for non-positive or non-integer values", () => {
    expect(parseHouseholdQuery({ page: "0" }).page).toBe(HOUSEHOLD_QUERY_DEFAULTS.page);
    expect(parseHouseholdQuery({ page: "abc" }).page).toBe(HOUSEHOLD_QUERY_DEFAULTS.page);
  });
});

describe("toApiParams", () => {
  it("converts empty-string filters to undefined", () => {
    expect(toApiParams(HOUSEHOLD_QUERY_DEFAULTS)).toEqual({
      stdorToU: undefined,
      Acorn_grouped: undefined,
      sort_by: "LCLid",
      ascending: true,
      page: 1,
      page_size: 10,
    });
  });
});

describe("buildHouseholdsHref", () => {
  it("omits params that are still at their default value", () => {
    expect(buildHouseholdsHref(HOUSEHOLD_QUERY_DEFAULTS, {})).toBe("/households");
  });

  it("includes changed filters and sort direction in the query string", () => {
    const href = buildHouseholdsHref(HOUSEHOLD_QUERY_DEFAULTS, {
      stdorToU: "ToU",
      ascending: false,
    });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("stdorToU")).toBe("ToU");
    expect(params.get("ascending")).toBe("false");
  });

  it("resets page to 1 when a non-page change is applied", () => {
    const state: HouseholdQueryState = { ...HOUSEHOLD_QUERY_DEFAULTS, page: 5 };
    const href = buildHouseholdsHref(state, { stdorToU: "ToU" });
    expect(new URLSearchParams(href.split("?")[1]).get("page")).toBeNull();
  });

  it("preserves an explicit page change instead of resetting it", () => {
    const href = buildHouseholdsHref(HOUSEHOLD_QUERY_DEFAULTS, { page: 4 });
    expect(new URLSearchParams(href.split("?")[1]).get("page")).toBe("4");
  });
});
