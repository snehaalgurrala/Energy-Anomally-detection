import { buildHouseholdsHref, type HouseholdQueryState } from "@/lib/household-query";
import { Pagination } from "@/components/pagination";

export function HouseholdPagination({
  query,
  total,
  page,
  pageSize,
}: {
  query: HouseholdQueryState;
  total: number;
  page: number;
  pageSize: number;
}) {
  return (
    <Pagination
      itemLabel="households"
      total={total}
      page={page}
      pageSize={pageSize}
      buildHref={(targetPage) => buildHouseholdsHref(query, { page: targetPage })}
    />
  );
}
