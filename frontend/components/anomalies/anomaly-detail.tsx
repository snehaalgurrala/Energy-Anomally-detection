import type { ReactNode } from "react";
import type { AnomalyRecord } from "@/lib/types";
import { formatDay, formatNumber, formatEvidence, AnomalyTypeBadge, AnomalyStatusBadge } from "@/lib/format";

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/20">
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function AnomalyDetail({ record }: { record: AnomalyRecord }) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <AnomalyStatusBadge status={record.anomaly_status} />
        <AnomalyTypeBadge type={record.anomaly_type} />
        {record.confidence && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Confidence: {record.confidence}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label="Meter" value={record.LCLid} />
        <Metric label="Date" value={formatDay(record.day)} />
        <Metric label="Energy consumption (kWh)" value={formatNumber(record.energy_sum)} />
        <Metric label="Expected consumption (kWh)" value={formatNumber(record.expected_consumption)} />
        <Metric label="Deviation" value={formatNumber(record.deviation)} />
        <Metric label="Statistical score" value={formatNumber(record.statistical_score)} />
        <Metric label="Statistical evidence" value={formatEvidence(record.statistical_evidence)} />
        <Metric label="Isolation Forest score" value={formatNumber(record.if_score)} />
        <Metric label="Isolation Forest evidence" value={formatEvidence(record.if_evidence)} />
        <Metric label="Hybrid score" value={formatEvidence(record.hybrid_score)} />
        <Metric label="Complete-day status" value={record.is_complete_day ? "Complete" : "Incomplete"} />
        <Metric label="Eligibility status" value={record.eligibility_status} />
      </dl>
    </section>
  );
}
