import type { AnomalyRecord } from "@/lib/types";
import {
  formatDay,
  formatNumber,
  formatEvidence,
  AnomalyTypeBadge,
  AnomalyStatusBadge,
  ANOMALY_TYPE_BORDER,
} from "@/lib/format";

export function MeterHistoryTable({
  rows,
  selectedDay,
}: {
  rows: AnomalyRecord[];
  selectedDay: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-6 text-center text-sm text-zinc-500 dark:border-white/15 dark:bg-black/20 dark:text-zinc-400">
        No history available for this meter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 bg-black/[.02] text-left text-xs font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[.03] dark:text-zinc-400">
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
          {rows.map((row) => {
            const isSelected = row.day === selectedDay;
            const border = row.anomaly_type
              ? (ANOMALY_TYPE_BORDER[row.anomaly_type] ?? "border-l-transparent")
              : "border-l-transparent";
            return (
              <tr
                key={row.day}
                aria-current={isSelected ? "true" : undefined}
                className={`border-b border-l-4 border-black/5 ${border} last:border-b-0 dark:border-white/10 ${
                  isSelected ? "bg-black/[.05] dark:bg-white/[.08]" : ""
                }`}
              >
                <td className="px-4 py-2.5 whitespace-nowrap font-medium tabular-nums">
                  {formatDay(row.day)}
                  {isSelected && (
                    <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/15 dark:text-zinc-300">
                      Selected
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.energy_sum)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(row.expected_consumption)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.deviation)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatEvidence(row.hybrid_score)}</td>
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
  );
}
