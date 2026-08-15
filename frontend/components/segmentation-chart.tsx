"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  CHART_ACTIVE_BAR,
  CHART_AXIS_TICK,
  CHART_CURSOR_FILL,
  CHART_GRID_STROKE,
  CHART_TOOLTIP,
  formatNumber,
  formatPercent,
  SEGMENT_COLOR,
} from "@/lib/format";

// Generic segment-comparison bar chart, shared by the household consumption
// segmentation (/households) and anomaly segmentation (/anomalies) sections
// -- `value`/`detail` let each caller plug in its own metric and tooltip
// context without duplicating the chart itself.
export interface SegmentBar {
  label: string;
  value: number | null;
  detail: string;
}

interface SegmentPoint extends SegmentBar {
  color: string;
}

// A plain string enum, not a formatter function -- this component is
// rendered from server pages, and function props can't cross the
// server/client boundary in React Server Components.
type ValueFormat = "number" | "percent";

function formatValue(value: number | null, format: ValueFormat): string {
  return format === "percent" ? formatPercent(value) : formatNumber(value);
}

function makeTooltipRenderer(valueLabel: string, format: ValueFormat) {
  return function renderTooltip({ active, payload }: TooltipContentProps) {
    const point = active ? (payload?.[0]?.payload as SegmentPoint | undefined) : undefined;
    if (!point) return null;
    return (
      <div className={CHART_TOOLTIP}>
        <p className="font-medium text-foreground">{point.label}</p>
        <p className="mt-1 text-foreground-muted">
          {valueLabel}: {formatValue(point.value, format)}
        </p>
        <p className="text-foreground-subtle">{point.detail}</p>
      </div>
    );
  };
}

// `order` fixes both the display order and the label-to-color mapping (each
// position gets the same SEGMENT_COLOR slot every render), so a segment's
// color never shifts with the data -- color follows identity, not rank.
// Bars with no matching label in `order` (or vice versa) are simply omitted
// rather than fabricated.
export function SegmentationChart({
  data,
  order,
  valueLabel,
  valueFormat = "number",
}: {
  data: SegmentBar[];
  order: string[];
  valueLabel: string;
  valueFormat?: ValueFormat;
}) {
  const points: SegmentPoint[] = order
    .map((label, i) => {
      const bar = data.find((d) => d.label === label);
      return bar ? { ...bar, color: SEGMENT_COLOR[i % SEGMENT_COLOR.length] } : null;
    })
    .filter((point): point is SegmentPoint => point !== null);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className={CHART_GRID_STROKE} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} className={CHART_AXIS_TICK} />
        <YAxis
          tick={{ fontSize: 11 }}
          width={56}
          tickFormatter={(v: number) => formatValue(v, valueFormat)}
          className={CHART_AXIS_TICK}
        />
        <Tooltip content={makeTooltipRenderer(valueLabel, valueFormat)} cursor={CHART_CURSOR_FILL} />
        <Bar dataKey="value" name={valueLabel} radius={[4, 4, 0, 0]} activeBar={CHART_ACTIVE_BAR}>
          {points.map((point) => (
            <Cell key={point.label} fill={point.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
