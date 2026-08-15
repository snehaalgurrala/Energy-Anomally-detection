"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import type { HouseholdSummaryRecord } from "@/lib/types";
import { formatNumber } from "@/lib/format";

export function HouseholdTable({ rows }: { rows: HouseholdSummaryRecord[] }) {
  const router = useRouter();
  // Carried through as `from` so the profile page's back link can restore
  // the explorer's current filters/sort/page instead of resetting them.
  const currentQuery = useSearchParams().toString();

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            <th className="px-4 py-2.5 font-medium">Meter</th>
            <th className="px-4 py-2.5 font-medium">Tariff</th>
            <th className="px-4 py-2.5 font-medium">ACORN group</th>
            <th className="px-4 py-2.5 font-medium text-right">Avg daily (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Median daily (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Max daily (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Variability</th>
            <th className="px-4 py-2.5 font-medium text-right">Avg weekday (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Avg weekend (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Weekend/weekday ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = `/households/${encodeURIComponent(row.LCLid)}${
              currentQuery ? `?from=${encodeURIComponent(currentQuery)}` : ""
            }`;
            // Same progressive-enhancement pattern as anomaly-table.tsx: the
            // real <Link> below still works on its own, this just extends
            // the click target to the whole row.
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
                <td className="px-4 py-2.5 text-foreground-muted">{row.stdorToU ?? "—"}</td>
                <td className="px-4 py-2.5 text-foreground-muted">
                  {row.Acorn_grouped ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.average_daily_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.median_daily_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.max_daily_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.consumption_variability)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.average_weekday_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.average_weekend_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.weekend_vs_weekday_ratio)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
