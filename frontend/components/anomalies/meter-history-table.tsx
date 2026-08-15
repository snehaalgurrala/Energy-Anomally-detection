"use client";

import { useState } from "react";
import type { AnomalyRecord } from "@/lib/types";
import {
  PILL_BUTTON,
  formatDay,
  formatNumber,
  formatEvidence,
  AnomalyTypeBadge,
  AnomalyStatusBadge,
  ANOMALY_TYPE_BORDER,
} from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

// Meter histories can run to hundreds of rows, so the table is paginated
// client-side over the already-fetched history array (no extra requests).
const PAGE_SIZE = 15;
const NAV_BUTTON = `${PILL_BUTTON} py-1.5`;

export function MeterHistoryTable({
  rows,
  selectedDay,
}: {
  rows: AnomalyRecord[];
  selectedDay: string;
}) {
  // Opens on whichever page contains the selected anomaly, so highlighting
  // is visible without the user having to hunt for it across pages.
  const selectedIndex = rows.findIndex((row) => row.day === selectedDay);
  const [page, setPage] = useState(selectedIndex >= 0 ? Math.floor(selectedIndex / PAGE_SIZE) + 1 : 1);

  if (rows.length === 0) {
    return <EmptyState message="No history available for this meter." />;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-foreground-subtle">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium text-right">Energy (kWh)</th>
              <th className="px-4 py-2.5 font-medium text-right">Expected (kWh)</th>
              <th className="px-4 py-2.5 font-medium text-right">Deviation</th>
              <th className="px-4 py-2.5 font-medium text-right">Hybrid score</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const isSelected = row.day === selectedDay;
              const border = row.anomaly_type
                ? (ANOMALY_TYPE_BORDER[row.anomaly_type] ?? "border-l-transparent")
                : "border-l-transparent";
              return (
                <tr
                  key={row.day}
                  aria-current={isSelected ? "true" : undefined}
                  className={`border-b border-l-4 border-border ${border} last:border-b-0 ${
                    isSelected ? "bg-surface-hover" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap font-medium tabular-nums text-foreground">
                    {formatDay(row.day)}
                    {isSelected && (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-hover ring-1 ring-inset ring-accent-border">
                        Selected
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(row.energy_sum)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatNumber(row.expected_consumption)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(row.deviation)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatEvidence(row.hybrid_score)}</td>
                  <td className="px-4 py-2.5">
                    <AnomalyStatusBadge status={row.anomaly_status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <AnomalyTypeBadge type={row.anomaly_type} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted">
          Showing <span className="tabular-nums">{(start + 1).toLocaleString()}</span>–
          <span className="tabular-nums">{Math.min(start + PAGE_SIZE, rows.length).toLocaleString()}</span> of{" "}
          <span className="tabular-nums">{rows.length.toLocaleString()}</span> records · page{" "}
          <span className="tabular-nums">{page}</span> of <span className="tabular-nums">{totalPages}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={NAV_BUTTON}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className={NAV_BUTTON}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
