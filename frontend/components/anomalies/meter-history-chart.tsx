"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DotItemDotProps, TooltipContentProps } from "recharts";
import type { AnomalyRecord } from "@/lib/types";
import { formatDay, formatNumber, ANOMALY_TYPE_COLOR } from "@/lib/format";

interface ChartPoint {
  day: string;
  energy_sum: number;
  expected_consumption: number | null;
  anomaly_status: string | null;
  anomaly_type: string | null;
}

// Design tokens shared with the rest of the page: the CSS var tracks light/
// dark automatically, and the neutral gray is used for both the expected
// line and non-anomaly points so it doesn't collide with the Spike/Drop
// colors, which are reserved for anomaly dots.
const FOREGROUND = "var(--foreground)";
const NEUTRAL = "#a1a1aa";

function renderTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/15 dark:bg-zinc-900">
      <p className="font-medium">{formatDay(point.day)}</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-300">
        Actual: {formatNumber(point.energy_sum)} kWh
      </p>
      <p className="text-zinc-600 dark:text-zinc-300">
        Expected: {formatNumber(point.expected_consumption)} kWh
      </p>
      {point.anomaly_status && (
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          {point.anomaly_status}
          {point.anomaly_type ? ` · ${point.anomaly_type}` : ""}
        </p>
      )}
    </div>
  );
}

export function MeterHistoryChart({
  rows,
  selectedDay,
}: {
  rows: AnomalyRecord[];
  selectedDay: string;
}) {
  const data: ChartPoint[] = rows.map((row) => ({
    day: row.day,
    energy_sum: row.energy_sum,
    expected_consumption: row.expected_consumption,
    anomaly_status: row.anomaly_status,
    anomaly_type: row.anomaly_type,
  }));

  // Thins out x-axis tick labels so ~10-12 are shown regardless of history
  // length, keeping the axis readable for meters with hundreds of records.
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  function renderActualDot({ cx, cy, payload, index }: DotItemDotProps) {
    if (cx === undefined || cy === undefined) return null;
    const point = payload as ChartPoint;
    const isSelected = point.day === selectedDay;
    const isAnomaly = point.anomaly_status === "Anomaly";
    const color = isAnomaly ? (ANOMALY_TYPE_COLOR[point.anomaly_type ?? ""] ?? NEUTRAL) : NEUTRAL;
    const radius = isSelected ? 6 : isAnomaly ? 4 : 2;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={radius}
        fill={color}
        stroke={isSelected ? FOREGROUND : "none"}
        strokeWidth={isSelected ? 2 : 0}
      />
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: ANOMALY_TYPE_COLOR.Spike }}
          />
          Spike
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: ANOMALY_TYPE_COLOR.Drop }}
          />
          Drop
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-2"
            style={{ borderColor: "var(--foreground)" }}
          />
          Selected date
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-black/10 dark:stroke-white/10" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDay}
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
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine x={selectedDay} stroke={FOREGROUND} strokeOpacity={0.6} strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="expected_consumption"
            name="Expected"
            stroke={NEUTRAL}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="energy_sum"
            name="Actual"
            stroke={FOREGROUND}
            strokeWidth={1.75}
            dot={renderActualDot}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
