// Shared display formatting for AnomalyRecord fields, used by both the
// anomaly list table and the anomaly detail / meter history views so the
// two don't drift into their own formatting rules.

// Locale is pinned (not `undefined`) so formatting is identical on the
// server and in the browser -- an unpinned locale renders using the
// server's runtime default on first render but the browser's default on
// hydration, which React flags as a hydration mismatch whenever they differ.
const DISPLAY_LOCALE = "en-US";

export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Numeric fields are null when a row is ineligible for scoring; the backend
// does not normalize +/-Infinity the way it does NaN, so those are handled
// defensively here too rather than being passed to toLocaleString.
export function formatNumber(value: number | null, options?: Intl.NumberFormatOptions): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "−∞";
  return value.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 2, ...options });
}

// Used by monthly-trend charts (household consumption, anomaly activity) --
// same pinned-locale reasoning as formatDay.
export function formatMonth(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString(DISPLAY_LOCALE, { year: "numeric", month: "short", timeZone: "UTC" });
}

export function formatEvidence(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "−∞";
  return `${(value * 100).toFixed(1)}%`;
}

// For values already on a 0-100 scale (e.g. anomaly_rate_pct), unlike
// formatEvidence which expects a 0-1 fraction and multiplies by 100 itself.
export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${formatNumber(value)}%`;
}

// Shared container/button class fragments reused verbatim across pages and
// components (cards, empty states, pill buttons) so the strings don't drift
// out of sync across files. Callers append their own padding/hover/etc. on
// top, since those vary by usage.
export const CARD = "rounded-lg border border-black/10 bg-white dark:border-white/15 dark:bg-black/20";
export const PILL_BUTTON =
  "rounded-full border border-black/[.08] px-4 text-sm font-medium transition-colors dark:border-white/[.145]";

// Shared filter-form field/label styling, reused across the anomaly and
// household explorer filter forms so the two don't drift apart.
export const FIELD =
  "rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-sm dark:border-white/15 dark:bg-black/20";
export const LABEL = "flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400";

// Slots 1 (blue) and 2 (orange) of the app's categorical palette, in fixed
// order -- validated as CVD-safe adjacent to each other in both color modes.
// Kept as raw hex so non-Tailwind consumers (e.g. chart SVG fills) can reuse
// the exact same colors instead of redefining them.
export const ANOMALY_TYPE_COLOR: Record<string, string> = {
  Spike: "#eb6834",
  Drop: "#2a78d6",
};

const ANOMALY_TYPE_STYLES: Record<string, string> = {
  Spike: "bg-[#eb6834]/10 text-[#c14f22] dark:bg-[#d95926]/15 dark:text-[#ff9d6e]",
  Drop: "bg-[#2a78d6]/10 text-[#1c5cab] dark:bg-[#3987e5]/15 dark:text-[#8ab8f5]",
};

export const ANOMALY_TYPE_BORDER: Record<string, string> = {
  Spike: "border-l-[#eb6834] dark:border-l-[#d95926]",
  Drop: "border-l-[#2a78d6] dark:border-l-[#3987e5]",
};

export function AnomalyTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  const style = ANOMALY_TYPE_STYLES[type] ?? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {type}
    </span>
  );
}

const ANOMALY_STATUS_STYLES: Record<string, string> = {
  Anomaly: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  Normal: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
};

export function AnomalyStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  const style = ANOMALY_STATUS_STYLES[status] ?? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

// Slots 3-7 of the same categorical palette ANOMALY_TYPE_COLOR draws slots
// 1-2 from (aqua, yellow, magenta, green, violet) -- deliberately skipping
// the blue/orange anomaly slots so segmentation charts are never confusable
// with anomaly Spike/Drop colors. Assigned in this fixed order to whichever
// segment labels a chart renders, never reassigned based on the current filter.
export const SEGMENT_COLOR = ["#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
