import type { HouseholdSummaryRecord } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { Metric } from "@/components/metric-card";

// Weekday/weekend/ratio are deliberately not repeated here as plain tiles --
// they get their own visual treatment via WeekdayWeekendComparison below.
export function HouseholdProfile({ household }: { household: HouseholdSummaryRecord }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Metric label="Meter" value={household.LCLid} />
      <Metric label="Tariff" value={household.stdorToU ?? "—"} />
      <Metric label="ACORN" value={household.Acorn ?? "—"} />
      <Metric label="ACORN group" value={household.Acorn_grouped ?? "—"} />
      <Metric label="Avg daily consumption (kWh)" value={formatNumber(household.average_daily_consumption)} />
      <Metric label="Median daily consumption (kWh)" value={formatNumber(household.median_daily_consumption)} />
      <Metric label="Max daily consumption (kWh)" value={formatNumber(household.max_daily_consumption)} />
      <Metric label="Min daily consumption (kWh)" value={formatNumber(household.minimum_daily_consumption)} />
      <Metric label="Consumption variability" value={formatNumber(household.consumption_variability)} />
    </dl>
  );
}
