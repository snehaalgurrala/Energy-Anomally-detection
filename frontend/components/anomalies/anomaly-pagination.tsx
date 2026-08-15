import { buildAnomaliesHref, type AnomalyQueryState } from "@/lib/anomaly-query";
import { Pagination } from "@/components/pagination";

export function AnomalyPagination({
  query,
  total,
  page,
  pageSize,
}: {
  query: AnomalyQueryState;
  total: number;
  page: number;
  pageSize: number;
}) {
  return (
    <Pagination
      itemLabel="anomalies"
      total={total}
      page={page}
      pageSize={pageSize}
      buildHref={(targetPage) => buildAnomaliesHref(query, { page: targetPage })}
    />
  );
}
