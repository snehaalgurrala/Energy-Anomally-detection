import { CARD } from "@/lib/format";

// Shared KPI tile, used by the dashboard and household overview stat grids
// so both draw from the same card/typography treatment.
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} p-5 transition-colors hover:border-border-strong`}>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
