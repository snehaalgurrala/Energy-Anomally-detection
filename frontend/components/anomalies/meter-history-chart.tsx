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

// Design tokens shared with the rest of the page. ACTUAL is a dedicated CSS
// var (light/dark aware, see globals.css) rather than `--foreground` so the
// actual-consumption line reads as blue and prominent, per the chart's
// visual spec. It's deliberately a different lightness than
// ANOMALY_TYPE_COLOR.Drop (also blue) so a Drop marker sitting on the line
// never reads as just a thicker bit of the line -- the halo ring drawn under
// every marker (see renderActualDot) reinforces that separation further.
const ACTUAL = "var(--chart-actual)";
const EXPECTED = "#a1a1aa";
const FOREGROUND = "var(--foreground)";
const RING = "var(--background)";

// Anomaly markers use a shape per type (independent of color) so identity
// never rests on hue alone: Spike points up, Drop points down.
const ANOMALY_HALF = 5;
const SELECTED_ANOMALY_HALF = 7;
const SELECTED_NORMAL_RADIUS = 6;
const HALO_SCALE = 1.7;

function trianglePoints(cx: number, cy: number, half: number, direction: "up" | "down"): string {
  return direction === "up"
    ? `${cx},${cy - half} ${cx - half},${cy + half} ${cx + half},${cy + half}`
    : `${cx},${cy + half} ${cx - half},${cy - half} ${cx + half},${cy - half}`;
}

function markerShape(type: string | null): "up" | "down" | null {
  if (type === "Spike") return "up";
  if (type === "Drop") return "down";
  return null;
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
        {point.day === selectedDay && (
          <p className="mt-1 font-medium text-zinc-700 dark:text-zinc-200">Selected date</p>
        )}
      </div>
    );
  }

  // Only anomaly points and the selected day get a marker -- for meters with
  // hundreds of records, drawing a dot on every normal point is what makes
  // the chart congested, and normal points carry no information the line
  // itself doesn't already show.
  function renderActualDot({ cx, cy, payload, index }: DotItemDotProps) {
    if (cx === undefined || cy === undefined) return null;
    const point = payload as ChartPoint;
    const isSelected = point.day === selectedDay;
    const isAnomaly = point.anomaly_status === "Anomaly";
    if (!isAnomaly && !isSelected) return null;

    const shape = markerShape(point.anomaly_type);
    const color = isAnomaly ? (ANOMALY_TYPE_COLOR[point.anomaly_type ?? ""] ?? FOREGROUND) : FOREGROUND;
    const half = isSelected && isAnomaly ? SELECTED_ANOMALY_HALF : isAnomaly ? ANOMALY_HALF : SELECTED_NORMAL_RADIUS;

    return (
      <g key={`dot-${index}`}>
        {/* Surface-colored halo lifts the marker off the line beneath it. */}
        {shape ? (
          <polygon points={trianglePoints(cx, cy, half * HALO_SCALE, shape)} fill={RING} />
        ) : (
          <circle cx={cx} cy={cy} r={half * HALO_SCALE} fill={RING} />
        )}
        {shape ? (
          <polygon
            points={trianglePoints(cx, cy, half, shape)}
            fill={color}
            stroke={isSelected ? FOREGROUND : "none"}
            strokeWidth={isSelected ? 1.5 : 0}
            strokeLinejoin="round"
          />
        ) : (
          <circle cx={cx} cy={cy} r={half} fill="none" stroke={FOREGROUND} strokeWidth={2} />
        )}
        {/* Outer ring gives the selected point/anomaly the strongest emphasis. */}
        {isSelected && (
          <circle
            cx={cx}
            cy={cy}
            r={half * HALO_SCALE + 3}
            fill="none"
            stroke={FOREGROUND}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        )}
      </g>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <polygon points="5,0 0,10 10,10" fill={ANOMALY_TYPE_COLOR.Spike} />
          </svg>
          Spike
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <polygon points="0,0 10,0 5,10" fill={ANOMALY_TYPE_COLOR.Drop} />
          </svg>
          Drop
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" fill="none" stroke="var(--foreground)" strokeWidth="2" />
          </svg>
          Selected date
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            className="stroke-black/10 dark:stroke-white/10"
          />
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
            stroke={EXPECTED}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="energy_sum"
            name="Actual"
            stroke={ACTUAL}
            strokeWidth={2}
            dot={renderActualDot}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
