import type { Metadata } from "next";
import { getHouseholds, getHouseholdsMonthlyTrend, getHouseholdsSummary } from "@/lib/api";
import { CARD, formatDay, formatNumber } from "@/lib/format";
import { parseHouseholdQuery, toApiParams, type RawSearchParams } from "@/lib/household-query";
import { mean, groupHouseholdsBy } from "@/lib/household-aggregate";
import { HouseholdFilters } from "@/components/households/household-filters";
import { HouseholdTable } from "@/components/households/household-table";
import { HouseholdPagination } from "@/components/households/household-pagination";
import { HouseholdMonthlyTrendChart } from "@/components/households/household-monthly-trend-chart";
import { WeekdayWeekendComparison } from "@/components/households/weekday-weekend-comparison";
import { SegmentationChart, type SegmentBar } from "@/components/segmentation-chart";

// Household counts and filters depend on the current URL query, so this
// route is always rendered per request rather than statically prerendered.
export const dynamic = "force-dynamic";

// Fixed display order for the two segmentation dimensions -- also fixes
// each segment's color slot (see SegmentationChart), independent of
// whichever order the backend happens to return groups in.
const ACORN_GROUP_ORDER = ["Affluent", "Comfortable", "Adversity", "ACORN-", "ACORN-U"];
const TARIFF_ORDER = ["Std", "ToU"];

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
  const [summary, explorer, monthlyTrend, allHouseholds] = await Promise.all([
    getHouseholdsSummary(),
    getHouseholds(toApiParams(query)),
    getHouseholdsMonthlyTrend(),
    // Independent of the explorer's own filters/sort/page -- the overview,
    // weekday/weekend, and segmentation sections always describe the full
    // dataset, not whatever the explorer is currently filtered to.
    getHouseholds({ page_size: 500 }),
  ]);
  const { rows, total, page, page_size } = explorer;

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

  const datasetWeekdayAvg = mean(allHouseholds.rows.map((h) => h.average_weekday_consumption));
  const datasetWeekendAvg = mean(allHouseholds.rows.map((h) => h.average_weekend_consumption));
  const datasetWeekendRatio = mean(allHouseholds.rows.map((h) => h.weekend_vs_weekday_ratio));

  function toSegmentBars(groups: ReturnType<typeof groupHouseholdsBy>): SegmentBar[] {
    return groups.map((g) => ({
      label: g.label,
      value: g.avgDailyConsumption,
      detail: `${g.count} household${g.count === 1 ? "" : "s"}`,
    }));
  }
  const acornData = toSegmentBars(groupHouseholdsBy(allHouseholds.rows, "Acorn_grouped"));
  const tariffData = toSegmentBars(groupHouseholdsBy(allHouseholds.rows, "stdorToU"));

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

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Consumption Overview</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Average daily consumption per household, by calendar month, across all {summary.total_meters}{" "}
          households.
        </p>
        <div className={`mt-4 ${CARD} p-4`}>
          <HouseholdMonthlyTrendChart rows={monthlyTrend.rows} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Weekday vs Weekend</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Dataset-wide average of each household&apos;s own weekday/weekend consumption.
        </p>
        <div className="mt-4">
          <WeekdayWeekendComparison
            weekdayAvg={datasetWeekdayAvg}
            weekendAvg={datasetWeekendAvg}
            ratio={datasetWeekendRatio}
          />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Segmentation Intelligence</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          How average consumption differs by ACORN classification and tariff type. This is a
          demographic/behavioral comparison, independent of anomaly detection -- a difference here
          reflects the segment&apos;s typical usage pattern, not a causal effect of ACORN or tariff on
          consumption.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`${CARD} p-4`}>
            <h3 className="text-sm font-semibold">By ACORN group</h3>
            <SegmentationChart
              data={acornData}
              order={ACORN_GROUP_ORDER}
              valueLabel="Average daily consumption (kWh)"
            />
          </div>
          <div className={`${CARD} p-4`}>
            <h3 className="text-sm font-semibold">By tariff</h3>
            <SegmentationChart
              data={tariffData}
              order={TARIFF_ORDER}
              valueLabel="Average daily consumption (kWh)"
            />
          </div>
        </div>
      </section>

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
