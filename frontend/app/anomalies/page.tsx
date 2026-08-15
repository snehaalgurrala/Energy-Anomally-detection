import type { Metadata } from "next";
import { getAnomalies, getAnomaliesMonthlyTrend, getAnomalySegments, getHighAnomalyHouseholds } from "@/lib/api";
import { CARD } from "@/lib/format";
import { parseAnomalyQuery, toApiParams, type RawSearchParams } from "@/lib/anomaly-query";
import {
  parseAnomalyHouseholdQuery,
  toApiParams as toHighAnomalyApiParams,
} from "@/lib/anomaly-household-query";
import { AnomalyFilters } from "@/components/anomalies/anomaly-filters";
import { AnomalyTable } from "@/components/anomalies/anomaly-table";
import { AnomalyPagination } from "@/components/anomalies/anomaly-pagination";
import { AnomalyMonthlyTrendChart } from "@/components/anomalies/anomaly-monthly-trend-chart";
import { HighAnomalyHouseholdControls } from "@/components/anomalies/high-anomaly-household-controls";
import { HighAnomalyHouseholdTable } from "@/components/anomalies/high-anomaly-household-table";
import { HighAnomalyHouseholdPagination } from "@/components/anomalies/high-anomaly-household-pagination";
import { SegmentationChart, type SegmentBar } from "@/components/segmentation-chart";
import { EmptyState } from "@/components/empty-state";
import type { AnomalySegmentRecord } from "@/lib/types";

// Anomaly counts and filters depend on the current URL query, so this route
// is always rendered per request rather than statically prerendered.
export const dynamic = "force-dynamic";

// Fixed display order for the two segmentation dimensions -- also fixes
// each segment's color slot (see SegmentationChart), matching the same
// ACORN group order used on /households.
const ACORN_GROUP_ORDER = ["Affluent", "Comfortable", "Adversity", "ACORN-", "ACORN-U"];
const TARIFF_ORDER = ["Std", "ToU"];

function toSegmentBars(groups: AnomalySegmentRecord[]): SegmentBar[] {
  return groups.map((g) => ({
    label: g.segment,
    value: g.anomaly_rate_pct,
    detail: `${g.anomaly_count.toLocaleString()} anomalies across ${g.household_count.toLocaleString()} households`,
  }));
}

export function generateMetadata(): Metadata {
  return { title: "Anomalies · Energy Anomaly Detection" };
}

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const rawSearchParams = await searchParams;
  const query = parseAnomalyQuery(rawSearchParams);
  const hhQuery = parseAnomalyHouseholdQuery(rawSearchParams);

  const [explorer, monthlyTrend, segments, highAnomalyHouseholds] = await Promise.all([
    getAnomalies(toApiParams(query)),
    getAnomaliesMonthlyTrend(),
    getAnomalySegments(),
    getHighAnomalyHouseholds(toHighAnomalyApiParams(hhQuery)),
  ]);
  const { rows, total, page, page_size } = explorer;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Anomaly Explorer</h1>
      <p className="mt-1.5 text-sm text-foreground-muted">
        Detected anomalies from the hybrid statistical / Isolation Forest detector.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Anomaly Activity Over Time</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Spike and Drop counts per calendar month, across all {monthlyTrend.rows.reduce((n, r) => n + r.anomaly_count, 0).toLocaleString()}{" "}
          detected anomalies.
        </p>
        <div className={`mt-4 ${CARD} p-4`}>
          <AnomalyMonthlyTrendChart rows={monthlyTrend.rows} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Anomaly Distribution by Segment</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Observed anomaly rate by household segment -- anomaly count divided by that segment&apos;s
          eligible readings, not a causal effect of ACORN or tariff on anomaly likelihood.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`${CARD} p-4`}>
            <h3 className="text-sm font-semibold text-foreground">By ACORN group</h3>
            <SegmentationChart
              data={toSegmentBars(segments.by_acorn_group)}
              order={ACORN_GROUP_ORDER}
              valueLabel="Anomaly rate"
              valueFormat="percent"
            />
          </div>
          <div className={`${CARD} p-4`}>
            <h3 className="text-sm font-semibold text-foreground">By tariff</h3>
            <SegmentationChart
              data={toSegmentBars(segments.by_tariff)}
              order={TARIFF_ORDER}
              valueLabel="Anomaly rate"
              valueFormat="percent"
            />
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Households with Notable Anomaly Activity</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Meters with at least one detected anomaly, ranked by activity -- a starting point for
          investigating specific households.
        </p>
        <div className="mt-4">
          <HighAnomalyHouseholdControls query={hhQuery} />
        </div>
        {highAnomalyHouseholds.rows.length === 0 ? (
          <div className="mt-6">
            <EmptyState message="No households match." />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <HighAnomalyHouseholdTable rows={highAnomalyHouseholds.rows} />
            </div>
            <HighAnomalyHouseholdPagination
              query={hhQuery}
              total={highAnomalyHouseholds.total}
              page={highAnomalyHouseholds.page}
              pageSize={highAnomalyHouseholds.page_size}
            />
          </>
        )}
      </section>

      <h2 className="mt-12 text-lg font-semibold tracking-tight text-foreground">Anomaly List</h2>

      <div className="mt-4">
        <AnomalyFilters query={query} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState message="No anomalies match the current filters." />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <AnomalyTable rows={rows} />
          </div>
          <AnomalyPagination query={query} total={total} page={page} pageSize={page_size} />
        </>
      )}
    </main>
  );
}
