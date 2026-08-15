import { afterEach, describe, expect, it, vi } from "vitest";
import { getHouseholdDailyAll } from "../api";
import type { DailyFeatureListResponse, DailyFeatureRecord } from "../types";

function makeRows(count: number, startIndex: number): DailyFeatureRecord[] {
  return Array.from({ length: count }, (_, i) => ({ date: `row-${startIndex + i}` })) as unknown as DailyFeatureRecord[];
}

function jsonResponse(body: DailyFeatureListResponse): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHouseholdDailyAll", () => {
  it("does not fetch a second page when everything fits on the first", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=500");
      return jsonResponse({ total: 120, page: 1, page_size: 500, rows: makeRows(120, 0) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getHouseholdDailyAll("MAC0001");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(120);
  });

  it("fetches every remaining page and combines the rows in page order", async () => {
    const total = 1010; // 3 pages at page_size=500: 500 + 500 + 10
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      const startIndex = (page - 1) * 500;
      const count = Math.min(500, total - startIndex);
      return jsonResponse({ total, page, page_size: 500, rows: makeRows(count, startIndex) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getHouseholdDailyAll("MAC0001");

    // Exactly the pages needed to cover `total` -- no more, no fewer.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(total);
    expect(rows.map((r) => r.date)).toEqual(makeRows(total, 0).map((r) => r.date));
  });

  it("stops after the exact page count when total is a multiple of the page size", async () => {
    const total = 1000; // exactly 2 pages at page_size=500
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return jsonResponse({ total, page, page_size: 500, rows: makeRows(500, (page - 1) * 500) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getHouseholdDailyAll("MAC0001");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(total);
  });
});
