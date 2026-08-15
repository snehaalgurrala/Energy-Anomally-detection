import type { HouseholdSummaryRecord } from "@/lib/types";
import { formatNumber } from "@/lib/format";

export function HouseholdTable({ rows }: { rows: HouseholdSummaryRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 bg-black/[.02] text-left text-xs font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[.03] dark:text-zinc-400">
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
          {rows.map((row) => (
            <tr
              key={row.LCLid}
              className="border-b border-black/5 last:border-b-0 hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.05]"
            >
              <td className="px-4 py-2.5 font-medium tabular-nums">{row.LCLid}</td>
              <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{row.stdorToU ?? "—"}</td>
              <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">
                {row.Acorn_grouped ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.average_daily_consumption)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.median_daily_consumption)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.max_daily_consumption)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.consumption_variability)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.average_weekday_consumption)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.average_weekend_consumption)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatNumber(row.weekend_vs_weekday_ratio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
