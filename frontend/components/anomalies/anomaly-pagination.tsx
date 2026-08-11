import Link from "next/link";
import { buildAnomaliesHref, type AnomalyQueryState } from "@/lib/anomaly-query";

const NAV_BUTTON =
  "rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium transition-colors dark:border-white/[.145]";

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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Showing <span className="tabular-nums">{start.toLocaleString()}</span>–
        <span className="tabular-nums">{end.toLocaleString()}</span> of{" "}
        <span className="tabular-nums">{total.toLocaleString()}</span> anomalies · page{" "}
        <span className="tabular-nums">{page}</span> of{" "}
        <span className="tabular-nums">{totalPages}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={buildAnomaliesHref(query, { page: page - 1 })} className={`${NAV_BUTTON} hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]`}>
            Previous
          </Link>
        ) : (
          <span className={`${NAV_BUTTON} cursor-not-allowed opacity-40`}>Previous</span>
        )}
        {page < totalPages ? (
          <Link href={buildAnomaliesHref(query, { page: page + 1 })} className={`${NAV_BUTTON} hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]`}>
            Next
          </Link>
        ) : (
          <span className={`${NAV_BUTTON} cursor-not-allowed opacity-40`}>Next</span>
        )}
      </div>
    </div>
  );
}
