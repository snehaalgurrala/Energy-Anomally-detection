"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { AnomalyMonthlyTrendRecord } from "@/lib/types";
import {
  ANOMALY_TYPE_COLOR,
  CHART_ACTIVE_BAR,
  CHART_AXIS_TICK,
  CHART_CURSOR_FILL,
  CHART_GRID_STROKE,
  CHART_TOOLTIP,
  formatMonth,
  formatNumber,
} from "@/lib/format";

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as AnomalyMonthlyTrendRecord | undefined) : undefined;
  if (!point) return null;
  return (
    <div className={CHART_TOOLTIP}>
      <p className="font-medium text-foreground">{formatMonth(point.month)}</p>
      <p className="mt-1 text-foreground-muted">
        Spikes: {point.spike_count.toLocaleString()}
      </p>
      <p className="text-foreground-muted">Drops: {point.drop_count.toLocaleString()}</p>
      <p className="mt-1 font-medium text-foreground">Total anomalies: {point.anomaly_count.toLocaleString()}</p>
      <p className="mt-1 text-foreground-subtle">
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
        <CartesianGrid vertical={false} strokeDasharray="3 3" className={CHART_GRID_STROKE} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          interval={tickInterval}
          tick={{ fontSize: 11 }}
          className={CHART_AXIS_TICK}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          width={40}
          allowDecimals={false}
          className={CHART_AXIS_TICK}
        />
        <Tooltip content={renderTooltip} cursor={CHART_CURSOR_FILL} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="spike_count"
          name="Spike"
          stackId="anomalies"
          fill={ANOMALY_TYPE_COLOR.Spike}
          activeBar={CHART_ACTIVE_BAR}
        />
        <Bar
          dataKey="drop_count"
          name="Drop"
          stackId="anomalies"
          fill={ANOMALY_TYPE_COLOR.Drop}
          radius={[3, 3, 0, 0]}
          activeBar={CHART_ACTIVE_BAR}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
