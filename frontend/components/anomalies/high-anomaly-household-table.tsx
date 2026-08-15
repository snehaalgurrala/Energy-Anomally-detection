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
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-foreground-subtle">
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
                className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-2.5 font-medium tabular-nums text-foreground">
                  <Link
                    href={href}
                    className="rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {row.LCLid}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{row.anomaly_count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{row.spike_count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{row.drop_count.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.anomaly_rate_pct)}%
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-foreground">
                  {formatDay(row.latest_anomaly_date)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(row.avg_hybrid_score)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(row.max_hybrid_score)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
