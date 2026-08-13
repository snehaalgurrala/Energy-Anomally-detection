import type { Metadata } from "next";
import { getAnomalies } from "@/lib/api";
import { CARD } from "@/lib/format";
import { parseAnomalyQuery, toApiParams, type RawSearchParams } from "@/lib/anomaly-query";
import { AnomalyFilters } from "@/components/anomalies/anomaly-filters";
import { AnomalyTable } from "@/components/anomalies/anomaly-table";
import { AnomalyPagination } from "@/components/anomalies/anomaly-pagination";

// Anomaly counts and filters depend on the current URL query, so this route
// is always rendered per request rather than statically prerendered.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "Anomalies · Energy Anomaly Detection" };
}

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseAnomalyQuery(await searchParams);
  const { rows, total, page, page_size } = await getAnomalies(toApiParams(query));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Anomaly Explorer</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Detected anomalies from the hybrid statistical / Isolation Forest detector.
      </p>

      <div className="mt-6">
        <AnomalyFilters query={query} />
      </div>

      {rows.length === 0 ? (
        <div className={`mt-6 ${CARD} p-10 text-center`}>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No anomalies match the current filters.
          </p>
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
