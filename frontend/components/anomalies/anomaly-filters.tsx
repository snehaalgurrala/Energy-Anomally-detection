"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildAnomaliesHref, type AnomalyQueryState } from "@/lib/anomaly-query";
import type { SortColumn } from "@/lib/types";

const SORT_OPTIONS: { value: SortColumn; label: string }[] = [
  { value: "hybrid_score", label: "Hybrid score" },
  { value: "statistical_score", label: "Statistical score" },
  { value: "if_score", label: "Isolation Forest score" },
  { value: "deviation", label: "Deviation" },
  { value: "day", label: "Date" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const FIELD =
  "rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-sm dark:border-white/15 dark:bg-black/20";
const LABEL = "flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400";

export function AnomalyFilters({ query }: { query: AnomalyQueryState }) {
  const router = useRouter();

  function apply(changes: Partial<AnomalyQueryState>) {
    router.push(buildAnomaliesHref(query, changes));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    apply({
      meter: String(formData.get("meter") ?? "").trim(),
      start_date: String(formData.get("start_date") ?? ""),
      end_date: String(formData.get("end_date") ?? ""),
    });
  }

  return (
    <form
      key={`${query.meter}|${query.start_date}|${query.end_date}`}
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/20"
    >
      <label className={LABEL}>
        Meter
        <input
          type="text"
          name="meter"
          defaultValue={query.meter}
          placeholder="e.g. MAC000002"
          className={`${FIELD} w-36`}
        />
      </label>

      <label className={LABEL}>
        Anomaly type
        <select
          value={query.anomaly_type}
          onChange={(e) => apply({ anomaly_type: e.target.value })}
          className={FIELD}
        >
          <option value="">All</option>
          <option value="Spike">Spike</option>
          <option value="Drop">Drop</option>
        </select>
      </label>

      <label className={LABEL}>
        Start date
        <input type="date" name="start_date" defaultValue={query.start_date} className={FIELD} />
      </label>

      <label className={LABEL}>
        End date
        <input type="date" name="end_date" defaultValue={query.end_date} className={FIELD} />
      </label>

      <label className={LABEL}>
        Sort by
        <select
          value={query.sort_by}
          onChange={(e) => apply({ sort_by: e.target.value as SortColumn })}
          className={FIELD}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL}>
        Direction
        <select
          value={query.ascending ? "asc" : "desc"}
          onChange={(e) => apply({ ascending: e.target.value === "asc" })}
          className={FIELD}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>

      <label className={LABEL}>
        Page size
        <select
          value={query.page_size}
          onChange={(e) => apply({ page_size: Number(e.target.value) })}
          className={FIELD}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Apply
      </button>
    </form>
  );
}
