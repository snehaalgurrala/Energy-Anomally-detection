"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import type { AnomalyRecord } from "@/lib/types";
import { formatDay, formatNumber, formatEvidence, AnomalyTypeBadge, ANOMALY_TYPE_BORDER } from "@/lib/format";

export function AnomalyTable({ rows }: { rows: AnomalyRecord[] }) {
  const router = useRouter();
  // Carried through as `from` so the detail page's back link can restore
  // the explorer's current filters/sort/page instead of resetting them.
  const currentQuery = useSearchParams().toString();

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            <th className="px-4 py-2.5 font-medium">Meter</th>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium text-right">Energy (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Expected (kWh)</th>
            <th className="px-4 py-2.5 font-medium text-right">Deviation</th>
            <th className="px-4 py-2.5 font-medium text-right">Statistical evidence</th>
            <th className="px-4 py-2.5 font-medium text-right">Isolation Forest evidence</th>
            <th className="px-4 py-2.5 font-medium text-right">Hybrid score</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = `/anomalies/${encodeURIComponent(row.LCLid)}/${row.day}${
              currentQuery ? `?from=${encodeURIComponent(currentQuery)}` : ""
            }`;
            const border = row.anomaly_type
              ? (ANOMALY_TYPE_BORDER[row.anomaly_type] ?? "border-l-transparent")
              : "border-l-transparent";
            // Row click is a progressive enhancement on top of the real
            // <Link> below: it's skipped when the click already originated
            // from that link (avoids a redundant navigation) or carried a
            // modifier key (so ctrl/cmd/shift-click still open a new tab).
            function handleRowClick(e: MouseEvent<HTMLTableRowElement>) {
              if ((e.target as HTMLElement).closest("a")) return;
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              router.push(href);
            }
            return (
              <tr
                key={`${row.LCLid}-${row.day}`}
                onClick={handleRowClick}
                className={`cursor-pointer border-b border-l-4 border-border ${border} last:border-b-0 hover:bg-surface-hover`}
              >
                <td className="px-4 py-2.5 font-medium tabular-nums text-foreground">
                  <Link
                    href={href}
                    className="rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {row.LCLid}
                  </Link>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-foreground">{formatDay(row.day)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(row.energy_sum)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumber(row.expected_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(row.deviation)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEvidence(row.statistical_evidence)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatEvidence(row.if_evidence)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                  {formatEvidence(row.hybrid_score)}
                </td>
                <td className="px-4 py-2.5">
                  <AnomalyTypeBadge type={row.anomaly_type} />
                </td>
                <td className="px-4 py-2.5 text-foreground-muted">
                  {row.confidence ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
