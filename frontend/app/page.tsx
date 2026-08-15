import { getSummary } from "@/lib/api";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { StatCard } from "@/components/stat-card";

// This page must always reflect the latest results, so it renders per
// request instead of being statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const summary = await getSummary();

  const stats: { label: string; value: string }[] = [
    { label: "Total Meters", value: summary.total_meters.toLocaleString() },
    { label: "Total Records", value: summary.total_records.toLocaleString() },
    { label: "Total Anomalies", value: summary.anomaly_count.toLocaleString() },
    { label: "Anomaly Rate", value: `${summary.anomaly_rate_pct.toFixed(2)}%` },
    { label: "Spikes", value: summary.spike_count.toLocaleString() },
    { label: "Drops", value: summary.drop_count.toLocaleString() },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Energy Consumption Anomaly Detection
      </h1>
      <p className="mt-1.5 text-sm text-foreground-muted">
        Live summary from the anomaly detection results.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <QuickActions />
    </main>
  );
}
