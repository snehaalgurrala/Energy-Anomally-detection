"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import type { HighAnomalyHouseholdRecord } from "@/lib/types";
import { formatDay, formatNumber } from "@/lib/format";

export function HighAnomalyHouseholdTable({ rows }: { rows: HighAnomalyHouseholdRecord[] }) {
  const router = useRouter();
  // Carries the *whole* current query (explorer filters + this table's own
  // hh_* sort/page state) so the anomaly detail page's back link restores
  // both when the user returns -- same `from=` convention as anomaly-table.tsx.
  const currentQuery = useSearchParams().toString();

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 bg-black/[.02] text-left text-xs font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[.03] dark:text-zinc-400">
            <th className="px-4 py-2.5 font-medium">Meter</th>
            <th className="px-4 py-2.5 font-medium text-right">Anomalies</th>
            <th className="px-4 py-2.5 font-medium text-right">Spikes</th>
            <th className="px-4 py-2.5 font-medium text-right">Drops</th>
            <th className="px-4 py-2.5 font-medium text-right">Anomaly rate</th>
            <th className="px-4 py-2.5 font-medium">Latest anomaly</th>
            <th className="px-4 py-2.5 font-medium text-right">Avg hybrid score</th>
            <th className="px-4 py-2.5 font-medium text-right">Max hybrid score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = `/anomalies/${encodeURIComponent(row.LCLid)}/${row.latest_anomaly_date}${
              currentQuery ? `?from=${encodeURIComponent(currentQuery)}` : ""
            }`;
            function handleRowClick(e: MouseEvent<HTMLTableRowElement>) {
              if ((e.target as HTMLElement).closest("a")) return;
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              router.push(href);
            }
            return (
              <tr
                key={row.LCLid}
                onClick={handleRowClick}
                className="cursor-pointer border-b border-black/5 last:border-b-0 hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.05]"
              >
                <td className="px-4 py-2.5 font-medium tabular-nums">
                  <Link
                    href={href}
                    className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
                  >
                    {row.LCLid}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.anomaly_count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.spike_count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.drop_count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(row.anomaly_rate_pct)}%
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  {formatDay(row.latest_anomaly_date)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.avg_hybrid_score)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.max_hybrid_score)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
