import { CARD, formatNumber } from "@/lib/format";

// Two-value comparison, not a chart -- recharts would be overkill for two
// bars, so this is a plain width-scaled div, reusing the same "consumption"
// identity color (--chart-actual) as the trend/daily line charts.
function Bar({ label, value, max }: { label: string; value: number | null; max: number }) {
  const pct = value !== null && max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-foreground-muted">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {formatNumber(value)} kWh
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full rounded-full bg-background">
        {value !== null && (
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, backgroundColor: "var(--chart-actual)" }}
          />
        )}
      </div>
    </div>
  );
}

export function WeekdayWeekendComparison({
  weekdayAvg,
  weekendAvg,
  ratio,
  title,
  description,
}: {
  weekdayAvg: number | null;
  weekendAvg: number | null;
  ratio: number | null;
  title?: string;
  description?: string;
}) {
  const max = Math.max(weekdayAvg ?? 0, weekendAvg ?? 0);
  const deltaPct = ratio !== null ? formatNumber(Math.abs(ratio - 1) * 100) : null;
  const deltaText =
    ratio === null
      ? null
      : ratio > 1
        ? `Weekends run ${deltaPct}% higher than weekdays.`
        : ratio < 1
          ? `Weekends run ${deltaPct}% lower than weekdays.`
          : "Weekend and weekday consumption are about equal.";

  return (
    <div className={`${CARD} p-5`}>
      {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
      {description && <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">
        <Bar label="Weekday average" value={weekdayAvg} max={max} />
        <Bar label="Weekend average" value={weekendAvg} max={max} />
      </div>
      {deltaText && <p className="mt-4 text-xs text-foreground-muted">{deltaText}</p>}
    </div>
  );
}
