"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { HouseholdMonthlyTrendRecord } from "@/lib/types";
import { CHART_AXIS_TICK, CHART_CURSOR_LINE, CHART_GRID_STROKE, CHART_TOOLTIP, formatMonth, formatNumber } from "@/lib/format";

// Same "consumption" identity color used by the anomaly chart's actual-usage
// line and the per-household daily chart, so consumption reads consistently
// across the dashboard.
const ACTUAL = "var(--chart-actual)";

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as HouseholdMonthlyTrendRecord | undefined) : undefined;
  if (!point) return null;
  return (
    <div className={CHART_TOOLTIP}>
      <p className="font-medium text-foreground">{formatMonth(point.month)}</p>
      <p className="mt-1 text-foreground-muted">
        Avg daily consumption: {formatNumber(point.average_daily_consumption)} kWh
      </p>
      <p className="text-foreground-subtle">
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
          width={56}
          tickFormatter={(v: number) => formatNumber(v)}
          className={CHART_AXIS_TICK}
        />
        <Tooltip content={renderTooltip} cursor={CHART_CURSOR_LINE} />
        <Line
          type="monotone"
          dataKey="average_daily_consumption"
          name="Average daily consumption"
          stroke={ACTUAL}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--background)", strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
