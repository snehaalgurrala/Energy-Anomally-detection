import type { Metadata } from "next";
import { getHouseholds, getHouseholdsSummary } from "@/lib/api";
import { CARD, formatDay, formatNumber } from "@/lib/format";
import { parseHouseholdQuery, toApiParams, type RawSearchParams } from "@/lib/household-query";
import { HouseholdFilters } from "@/components/households/household-filters";
import { HouseholdTable } from "@/components/households/household-table";
import { HouseholdPagination } from "@/components/households/household-pagination";

// Household counts and filters depend on the current URL query, so this
// route is always rendered per request rather than statically prerendered.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "Households · Energy Anomaly Detection" };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} p-5`}>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseHouseholdQuery(await searchParams);
  const [summary, { rows, total, page, page_size }] = await Promise.all([
    getHouseholdsSummary(),
    getHouseholds(toApiParams(query)),
  ]);

  const stats: { label: string; value: string }[] = [
    { label: "Households", value: summary.total_meters.toLocaleString() },
    { label: "Half-Hourly Readings", value: summary.total_half_hourly_readings.toLocaleString() },
    { label: "Daily Records", value: summary.total_daily_records.toLocaleString() },
    {
      label: "Date Range",
      value: `${formatDay(summary.date_range_start)} – ${formatDay(summary.date_range_end)}`,
    },
    { label: "Missing Energy Readings", value: summary.missing_energy_readings.toLocaleString() },
    { label: "Incomplete Days", value: summary.incomplete_days.toLocaleString() },
    { label: "Avg Daily Consumption (kWh)", value: formatNumber(summary.average_daily_consumption) },
    {
      label: "Avg Household Daily Consumption (kWh)",
      value: formatNumber(summary.average_household_daily_consumption),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Household Intelligence</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Dataset overview and per-household consumption metrics.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <h2 className="mt-12 text-lg font-semibold tracking-tight">Household Explorer</h2>

      <div className="mt-4">
        <HouseholdFilters query={query} />
      </div>

      {rows.length === 0 ? (
        <div className={`mt-6 ${CARD} p-10 text-center`}>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No households match the current filters.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <HouseholdTable rows={rows} />
          </div>
          <HouseholdPagination query={query} total={total} page={page} pageSize={page_size} />
        </>
      )}
    </main>
  );
}
