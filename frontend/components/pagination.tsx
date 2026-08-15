import Link from "next/link";
import { PILL_BUTTON } from "@/lib/format";

const NAV_BUTTON = `${PILL_BUTTON} py-1.5`;

export function Pagination({
  itemLabel,
  total,
  page,
  pageSize,
  buildHref,
}: {
  itemLabel: string;
  total: number;
  page: number;
  pageSize: number;
  buildHref: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-foreground-muted">
        Showing <span className="tabular-nums">{start.toLocaleString()}</span>–
        <span className="tabular-nums">{end.toLocaleString()}</span> of{" "}
        <span className="tabular-nums">{total.toLocaleString()}</span> {itemLabel} · page{" "}
        <span className="tabular-nums">{page}</span> of{" "}
        <span className="tabular-nums">{totalPages}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className={NAV_BUTTON}>
            Previous
          </Link>
        ) : (
          <span className={`${NAV_BUTTON} cursor-not-allowed opacity-40`}>Previous</span>
        )}
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className={NAV_BUTTON}>
            Next
          </Link>
        ) : (
          <span className={`${NAV_BUTTON} cursor-not-allowed opacity-40`}>Next</span>
        )}
      </div>
    </div>
  );
}
