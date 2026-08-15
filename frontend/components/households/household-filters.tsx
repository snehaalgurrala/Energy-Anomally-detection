"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildHouseholdsHref, type HouseholdQueryState } from "@/lib/household-query";
import { CARD, FIELD, LABEL, PILL_BUTTON_PRIMARY } from "@/lib/format";
import type { HouseholdSortColumn } from "@/lib/types";

const SORT_OPTIONS: { value: HouseholdSortColumn; label: string }[] = [
  { value: "LCLid", label: "Meter ID" },
  { value: "average_daily_consumption", label: "Average daily consumption" },
  { value: "median_daily_consumption", label: "Median daily consumption" },
  { value: "max_daily_consumption", label: "Maximum daily consumption" },
  { value: "consumption_variability", label: "Consumption variability" },
  { value: "average_weekday_consumption", label: "Average weekday consumption" },
  { value: "average_weekend_consumption", label: "Average weekend consumption" },
  { value: "weekend_vs_weekday_ratio", label: "Weekend/weekday ratio" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function HouseholdFilters({ query }: { query: HouseholdQueryState }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const changes: Partial<HouseholdQueryState> = {
      stdorToU: String(formData.get("stdorToU") ?? ""),
      Acorn_grouped: String(formData.get("Acorn_grouped") ?? ""),
      sort_by: formData.get("sort_by") as HouseholdSortColumn,
      ascending: formData.get("ascending") === "asc",
      page_size: Number(formData.get("page_size")),
    };
    const href = buildHouseholdsHref(query, changes);
    // Wrapping the navigation in a transition keeps this form (and the
    // current results) mounted while the new page renders, instead of the
    // route's loading.tsx replacing the whole page for a filter tweak.
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <form
      key={`${query.stdorToU}|${query.Acorn_grouped}|${query.sort_by}|${query.ascending}|${query.page_size}`}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className={`flex flex-wrap items-end gap-3 ${CARD} p-4 transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      <label className={LABEL}>
        Tariff
        <select name="stdorToU" defaultValue={query.stdorToU} className={FIELD}>
          <option value="">All</option>
          <option value="Std">Standard</option>
          <option value="ToU">Time of Use</option>
        </select>
      </label>

      <label className={LABEL}>
        ACORN group
        <select name="Acorn_grouped" defaultValue={query.Acorn_grouped} className={FIELD}>
          <option value="">All</option>
          <option value="Affluent">Affluent</option>
          <option value="Comfortable">Comfortable</option>
          <option value="Adversity">Adversity</option>
          <option value="ACORN-">ACORN-</option>
          <option value="ACORN-U">ACORN-U</option>
        </select>
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
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
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

      <button type="submit" disabled={isPending} className={`${PILL_BUTTON_PRIMARY} py-1.5`}>
        {isPending ? "Applying…" : "Apply"}
      </button>
    </form>
  );
}
