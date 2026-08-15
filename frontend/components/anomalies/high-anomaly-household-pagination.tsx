"use client";

import { useSearchParams } from "next/navigation";
import { buildAnomalyHouseholdHref, type AnomalyHouseholdQueryState } from "@/lib/anomaly-household-query";
import { Pagination } from "@/components/pagination";

export function HighAnomalyHouseholdPagination({
  query,
  total,
  page,
  pageSize,
}: {
  query: AnomalyHouseholdQueryState;
  total: number;
  page: number;
  pageSize: number;
}) {
  const currentSearch = useSearchParams().toString();

  return (
    <Pagination
      itemLabel="households"
      total={total}
      page={page}
      pageSize={pageSize}
      buildHref={(targetPage) => buildAnomalyHouseholdHref(currentSearch, query, { page: targetPage })}
    />
  );
}
