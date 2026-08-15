"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { AnomalyMonthlyTrendRecord } from "@/lib/types";
import { ANOMALY_TYPE_COLOR, formatMonth, formatNumber } from "@/lib/format";

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as AnomalyMonthlyTrendRecord | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/15 dark:bg-zinc-900">
      <p className="font-medium">{formatMonth(point.month)}</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-300">
        Spikes: {point.spike_count.toLocaleString()}
      </p>
      <p className="text-zinc-600 dark:text-zinc-300">Drops: {point.drop_count.toLocaleString()}</p>
      <p className="mt-1 font-medium">Total anomalies: {point.anomaly_count.toLocaleString()}</p>
      <p className="mt-1 text-zinc-500 dark:text-zinc-400">
        Out of {formatNumber(point.eligible_count)} eligible readings that month
      </p>
    </div>
  );
}

// Bars (event counts), not a line (a continuous quantity like consumption)
// -- deliberately different visual language from the consumption charts.
// Spike/Drop stacked in the same colors used everywhere else anomaly type
// is shown (badges, meter history chart), so identity stays consistent.
// eligible_count is tooltip-only context, never plotted, to avoid a
// second/dual y-axis.
export function AnomalyMonthlyTrendChart({ rows }: { rows: AnomalyMonthlyTrendRecord[] }) {
  const tickInterval = Math.max(0, Math.ceil(rows.length / 12) - 1);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
          width={40}
          allowDecimals={false}
          className="fill-zinc-500 dark:fill-zinc-400"
        />
        <Tooltip content={renderTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="spike_count" name="Spike" stackId="anomalies" fill={ANOMALY_TYPE_COLOR.Spike} />
        <Bar
          dataKey="drop_count"
          name="Drop"
          stackId="anomalies"
          fill={ANOMALY_TYPE_COLOR.Drop}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
