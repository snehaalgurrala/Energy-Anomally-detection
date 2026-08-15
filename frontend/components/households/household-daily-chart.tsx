"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { DailyFeatureRecord } from "@/lib/types";
import { CHART_AXIS_TICK, CHART_CURSOR_LINE, CHART_GRID_STROKE, CHART_TOOLTIP, formatDay, formatNumber } from "@/lib/format";

const ACTUAL = "var(--chart-actual)";

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as DailyFeatureRecord | undefined) : undefined;
  if (!point) return null;
  const isPartial = point.completeness_rate < 1;
  return (
    <div className={CHART_TOOLTIP}>
      <p className="font-medium text-foreground">{formatDay(point.date)}</p>
      <p className="mt-1 text-foreground-muted">
        Consumption: {formatNumber(point.daily_total)} kWh
      </p>
      {isPartial && (
        <p className="mt-1 text-foreground-subtle">
          Partial day: {point.reading_count}/{point.expected_reading_count} readings
        </p>
      )}
    </div>
  );
}

// Same sparse-tick pattern as meter-history-chart.tsx: a household can have
// 500+ days of history, so ticks are thinned rather than data points dropped.
export function HouseholdDailyChart({ rows }: { rows: DailyFeatureRecord[] }) {
  const tickInterval = Math.max(0, Math.ceil(rows.length / 12) - 1);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className={CHART_GRID_STROKE} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
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
          dataKey="daily_total"
          name="Daily consumption"
          stroke={ACTUAL}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--background)", strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
