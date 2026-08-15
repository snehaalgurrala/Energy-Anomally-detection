// Dataset-wide aggregation over the full (unfiltered) household list, used
// by the /households page's Consumption Overview / Weekday vs Weekend /
// Segmentation sections. These are plain client-side reductions over fields
// the backend already computes per household -- no new metrics, just means
// and group-bys.

import type { HouseholdSummaryRecord } from "./types";

// Skips null/undefined/NaN rather than treating a missing value as 0, same
// reasoning as the backend's own NaN-skipping aggregates.
export function mean(values: (number | null | undefined)[]): number | null {
  const real = values.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (real.length === 0) return null;
  return real.reduce((sum, v) => sum + v, 0) / real.length;
}

export interface HouseholdGroupSummary {
  label: string;
  count: number;
  avgDailyConsumption: number | null;
}

// Groups households by a categorical field (stdorToU or Acorn_grouped),
// skipping rows with no value for that field rather than inventing an
// "Unknown" bucket. Order is caller-defined (see segmentation-chart.tsx),
// not decided here.
export function groupHouseholdsBy(
  rows: HouseholdSummaryRecord[],
  field: "stdorToU" | "Acorn_grouped",
): HouseholdGroupSummary[] {
  const groups = new Map<string, HouseholdSummaryRecord[]>();
  for (const row of rows) {
    const label = row[field];
    if (!label) continue;
    const bucket = groups.get(label);
    if (bucket) bucket.push(row);
    else groups.set(label, [row]);
  }
  return Array.from(groups.entries()).map(([label, group]) => ({
    label,
    count: group.length,
    avgDailyConsumption: mean(group.map((h) => h.average_daily_consumption)),
  }));
}
