import type { ReactNode } from "react";
import { CARD } from "@/lib/format";

// Shared dt/dd metric tile, used inside a `<dl>` grid on both the anomaly
// detail and household profile pages so the two detail views share one
// metrics-grid look.
export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`${CARD} p-4`}>
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
