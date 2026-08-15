"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { HouseholdMonthlyTrendRecord } from "@/lib/types";
import { formatMonth, formatNumber } from "@/lib/format";

// Same "consumption" identity color used by the anomaly chart's actual-usage
// line and the per-household daily chart, so consumption reads consistently
// across the dashboard.
const ACTUAL = "var(--chart-actual)";

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as HouseholdMonthlyTrendRecord | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/15 dark:bg-zinc-900">
      <p className="font-medium">{formatMonth(point.month)}</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-300">
        Avg daily consumption: {formatNumber(point.average_daily_consumption)} kWh
      </p>
      <p className="text-zinc-500 dark:text-zinc-400">
        Based on {point.household_day_count.toLocaleString()} household-days
      </p>
    </div>
  );
}

export function HouseholdMonthlyTrendChart({ rows }: { rows: HouseholdMonthlyTrendRecord[] }) {
  // Thins out x-axis tick labels so the axis stays readable regardless of
  // how many months are in the dataset, same formula as meter-history-chart.
  const tickInterval = Math.max(0, Math.ceil(rows.length / 12) - 1);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-black/10 dark:stroke-white/10" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          interval={tickInterval}
          tick={{ fontSize: 11 }}
          className="fill-zinc-500 dark:fill-zinc-400"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          width={56}
          tickFormatter={(v: number) => formatNumber(v)}
          className="fill-zinc-500 dark:fill-zinc-400"
        />
        <Tooltip content={renderTooltip} />
        <Line
          type="monotone"
          dataKey="average_daily_consumption"
          name="Average daily consumption"
          stroke={ACTUAL}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
