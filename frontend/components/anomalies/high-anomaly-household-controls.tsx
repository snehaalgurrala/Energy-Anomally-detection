"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildAnomalyHouseholdHref,
  type AnomalyHouseholdQueryState,
} from "@/lib/anomaly-household-query";
import { CARD, FIELD, LABEL, PILL_BUTTON_PRIMARY } from "@/lib/format";
import type { HighAnomalySortColumn } from "@/lib/types";

const SORT_OPTIONS: { value: HighAnomalySortColumn; label: string }[] = [
  { value: "anomaly_count", label: "Anomaly count" },
  { value: "spike_count", label: "Spike count" },
  { value: "drop_count", label: "Drop count" },
  { value: "anomaly_rate_pct", label: "Anomaly rate" },
  { value: "avg_hybrid_score", label: "Avg hybrid score" },
  { value: "max_hybrid_score", label: "Max hybrid score" },
  { value: "latest_anomaly_date", label: "Latest anomaly" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function HighAnomalyHouseholdControls({ query }: { query: AnomalyHouseholdQueryState }) {
  const router = useRouter();
  const currentSearch = useSearchParams().toString();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const changes: Partial<AnomalyHouseholdQueryState> = {
      sort_by: formData.get("hh_sort_by") as HighAnomalySortColumn,
      ascending: formData.get("hh_ascending") === "asc",
      page_size: Number(formData.get("hh_page_size")),
    };
    const href = buildAnomalyHouseholdHref(currentSearch, query, changes);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <form
      key={`${query.sort_by}|${query.ascending}|${query.page_size}`}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className={`flex flex-wrap items-end gap-3 ${CARD} p-4 transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      <label className={LABEL}>
        Sort by
        <select name="hh_sort_by" defaultValue={query.sort_by} className={FIELD}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL}>
        Direction
        <select name="hh_ascending" defaultValue={query.ascending ? "asc" : "desc"} className={FIELD}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>

      <label className={LABEL}>
        Page size
        <select name="hh_page_size" defaultValue={query.page_size} className={FIELD}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={isPending} className={`${PILL_BUTTON_PRIMARY} py-1.5`}>
        {isPending ? "Applying…" : "Apply"}
      </button>
    </form>
  );
}
