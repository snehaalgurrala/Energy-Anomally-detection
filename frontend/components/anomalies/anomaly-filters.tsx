"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildAnomaliesHref, type AnomalyQueryState } from "@/lib/anomaly-query";
import { PILL_BUTTON } from "@/lib/format";
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
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const changes: Partial<AnomalyQueryState> = {
      meter: String(formData.get("meter") ?? "").trim(),
      anomaly_type: String(formData.get("anomaly_type") ?? ""),
      start_date: String(formData.get("start_date") ?? ""),
      end_date: String(formData.get("end_date") ?? ""),
      sort_by: formData.get("sort_by") as SortColumn,
      ascending: formData.get("ascending") === "asc",
      page_size: Number(formData.get("page_size")),
    };
    const href = buildAnomaliesHref(query, changes);
    // Wrapping the navigation in a transition keeps this form (and the
    // current results) mounted while the new page renders, instead of the
    // route's loading.tsx replacing the whole page for a filter tweak.
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <form
      key={`${query.meter}|${query.anomaly_type}|${query.start_date}|${query.end_date}|${query.sort_by}|${query.ascending}|${query.page_size}`}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className={`flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-4 transition-opacity dark:border-white/15 dark:bg-black/20 ${
        isPending ? "opacity-60" : ""
      }`}
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
        <select name="anomaly_type" defaultValue={query.anomaly_type} className={FIELD}>
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
        <select name="sort_by" defaultValue={query.sort_by} className={FIELD}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL}>
        Direction
        <select name="ascending" defaultValue={query.ascending ? "asc" : "desc"} className={FIELD}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>

      <label className={LABEL}>
        Page size
        <select name="page_size" defaultValue={query.page_size} className={FIELD}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={isPending}
        className={`${PILL_BUTTON} py-1.5 hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#1a1a1a]`}
      >
        {isPending ? "Applying…" : "Apply"}
      </button>
    </form>
  );
}
