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
export const CARD = "rounded-xl border border-border bg-surface shadow-sm shadow-black/20";

// Base interaction/focus/disabled behavior shared by both button variants
// below, so every button in the app dims, disables, and focuses the same way.
const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

// Secondary/neutral action -- pagination, back links, retry buttons.
export const PILL_BUTTON =
  `${BUTTON_BASE} border border-border bg-surface px-4 text-foreground hover:border-border-strong hover:bg-surface-hover`;

// Primary/accent action -- the main call to action in a form or panel
// (Apply, Ask, Summarize dashboard, Explain this anomaly).
export const PILL_BUTTON_PRIMARY =
  `${BUTTON_BASE} border border-transparent bg-accent px-4 text-white shadow-sm shadow-accent/30 hover:bg-accent-hover active:bg-accent-active`;

// Shared filter-form field/label styling, reused across the anomaly and
// household explorer filter forms so the two don't drift apart.
export const FIELD =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-foreground-subtle transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";
export const LABEL =
  "flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-subtle";

// Shared recharts chrome (tooltip card, gridlines, axis ticks), reused by
// every chart so they all read as the same visual system.
export const CHART_TOOLTIP =
  "rounded-lg border border-border-strong bg-surface-hover/95 px-3 py-2 text-xs shadow-lg shadow-black/50 backdrop-blur-sm";
export const CHART_GRID_STROKE = "stroke-border";
export const CHART_AXIS_TICK = "fill-foreground-subtle";

// Hover-state chrome shared by every recharts <Tooltip>: a subtle
// accent-tinted cursor instead of recharts' default light-gray highlight
// (which reads as a harsh white flash against the navy background).
export const CHART_CURSOR_FILL = { fill: "var(--accent-soft)" };
export const CHART_CURSOR_LINE = { stroke: "var(--accent)", strokeOpacity: 0.35, strokeWidth: 1 };
// Subtle per-bar hover emphasis, shared by every <Bar> so hovering one
// category doesn't repaint it a different hue -- just lifts it slightly.
export const CHART_ACTIVE_BAR = { fillOpacity: 0.85, stroke: "var(--foreground)", strokeOpacity: 0.4, strokeWidth: 1 };

// Spike uses the app's semantic "warning" token (a sudden increase reads as
// "elevated"). Drop uses a dedicated --drop violet (see globals.css) rather
// than --info/blue: the meter-history chart already plots two blue lines
// (--chart-actual, --chart-expected), so a blue Drop marker sat on top of
// them and blended in. Deliberately not danger/success either: those are
// already used by AnomalyStatusBadge for the Anomaly/Normal status shown
// right next to this badge (see anomaly-detail.tsx, meter-history-table.tsx),
// so reusing them here would make two differently-meant badges look
// identical. Every token here is tuned for contrast against navy (see
// globals.css). Kept as CSS var() strings (not Tailwind classes) so
// non-Tailwind consumers -- chart SVG fills -- can reuse the exact same
// colors, same pattern as --chart-actual/--chart-expected.
export const ANOMALY_TYPE_COLOR: Record<string, string> = {
  Spike: "var(--warning)",
  Drop: "var(--drop)",
};

const ANOMALY_TYPE_STYLES: Record<string, string> = {
  Spike: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/25",
  Drop: "bg-drop-soft text-drop ring-1 ring-inset ring-drop/25",
};

export const ANOMALY_TYPE_BORDER: Record<string, string> = {
  Spike: "border-l-warning",
  Drop: "border-l-drop",
};

export function AnomalyTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-foreground-subtle">—</span>;
  const style = ANOMALY_TYPE_STYLES[type] ?? "bg-border text-foreground-muted ring-1 ring-inset ring-border-strong";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {type}
    </span>
  );
}

const ANOMALY_STATUS_STYLES: Record<string, string> = {
  Anomaly: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/25",
  Normal: "bg-success-soft text-success ring-1 ring-inset ring-success/25",
};

export function AnomalyStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-foreground-subtle">—</span>;
  const style = ANOMALY_STATUS_STYLES[status] ?? "bg-border text-foreground-muted ring-1 ring-inset ring-border-strong";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

// A 5-slot categorical palette for segmentation charts (ACORN group, tariff),
// deliberately distinct from the warning/info hues ANOMALY_TYPE_COLOR uses
// for Spike/Drop and from the danger/success hues AnomalyStatusBadge uses,
// so a segmentation bar is never confusable with an anomaly-type or status
// indicator shown elsewhere on the same page. Assigned in this fixed order
// to whichever segment labels a chart renders, never reassigned based on
// the current filter.
export const SEGMENT_COLOR = ["#1baf7a", "#22d3ee", "#e87ba4", "#c2571a", "#4a3aa7"];
