"use client";

import { useRouter } from "next/navigation";
import type { AnomalyRecord } from "@/lib/types";

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatNumber(value: number | null, options?: Intl.NumberFormatOptions): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2, ...options });
}

function formatEvidence(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

// Slots 1 (blue) and 2 (orange) of the app's categorical palette, in fixed
// order -- validated as CVD-safe adjacent to each other in both color modes.
const ANOMALY_TYPE_STYLES: Record<string, string> = {
  Spike: "bg-[#eb6834]/10 text-[#c14f22] dark:bg-[#d95926]/15 dark:text-[#ff9d6e]",
  Drop: "bg-[#2a78d6]/10 text-[#1c5cab] dark:bg-[#3987e5]/15 dark:text-[#8ab8f5]",
};
const ANOMALY_TYPE_BORDER: Record<string, string> = {
  Spike: "border-l-[#eb6834] dark:border-l-[#d95926]",
  Drop: "border-l-[#2a78d6] dark:border-l-[#3987e5]",
};

function AnomalyTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  const style = ANOMALY_TYPE_STYLES[type] ?? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {type}
    </span>
  );
}

export function AnomalyTable({ rows }: { rows: AnomalyRecord[] }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 bg-black/[.02] text-left text-xs font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[.03] dark:text-zinc-400">
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
            const href = `/anomalies/${encodeURIComponent(row.LCLid)}/${row.day}`;
            const border = row.anomaly_type
              ? (ANOMALY_TYPE_BORDER[row.anomaly_type] ?? "border-l-transparent")
              : "border-l-transparent";
            return (
              <tr
                key={`${row.LCLid}-${row.day}`}
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                className={`cursor-pointer border-b border-l-4 border-black/5 ${border} last:border-b-0 hover:bg-black/[.03] focus:bg-black/[.03] focus:outline-none dark:border-white/10 dark:hover:bg-white/[.05] dark:focus:bg-white/[.05]`}
              >
                <td className="px-4 py-2.5 font-medium tabular-nums">{row.LCLid}</td>
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatDay(row.day)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.energy_sum)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(row.expected_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.deviation)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatEvidence(row.statistical_evidence)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatEvidence(row.if_evidence)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {formatEvidence(row.hybrid_score)}
                </td>
                <td className="px-4 py-2.5">
                  <AnomalyTypeBadge type={row.anomaly_type} />
                </td>
                <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
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
