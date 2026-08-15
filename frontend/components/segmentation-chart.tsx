"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { formatNumber, formatPercent, SEGMENT_COLOR } from "@/lib/format";

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
      <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/15 dark:bg-zinc-900">
        <p className="font-medium">{point.label}</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">
          {valueLabel}: {formatValue(point.value, format)}
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">{point.detail}</p>
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
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-black/10 dark:stroke-white/10" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-zinc-500 dark:fill-zinc-400" />
        <YAxis
          tick={{ fontSize: 11 }}
          width={56}
          tickFormatter={(v: number) => formatValue(v, valueFormat)}
          className="fill-zinc-500 dark:fill-zinc-400"
        />
        <Tooltip content={makeTooltipRenderer(valueLabel, valueFormat)} />
        <Bar dataKey="value" name={valueLabel} radius={[4, 4, 0, 0]}>
          {points.map((point) => (
            <Cell key={point.label} fill={point.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
