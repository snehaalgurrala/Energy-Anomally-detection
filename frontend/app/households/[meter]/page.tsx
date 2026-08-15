import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getHouseholdDailyAll, getHouseholdDetail } from "@/lib/api";
import { CARD } from "@/lib/format";
import { HouseholdAiAgent } from "@/components/households/household-ai-agent";
import { HouseholdProfile } from "@/components/households/household-profile";
import { WeekdayWeekendComparison } from "@/components/households/weekday-weekend-comparison";
import { HouseholdDailyChart } from "@/components/households/household-daily-chart";

// Detail depends on the specific meter in the URL, so this route is always
// rendered per request rather than statically prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ meter: string }>;
}): Promise<Metadata> {
  const { meter } = await params;
  return { title: `${meter} · Households · Energy Anomaly Detection` };
}

export default async function HouseholdProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ meter: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { meter } = await params;
  const { from } = await searchParams;
  const backHref = from ? `/households?${from}` : "/households";

  let household;
  try {
    household = await getHouseholdDetail(meter);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let daily = null;
  let dailyError: string | null = null;
  try {
    daily = await getHouseholdDailyAll(meter);
  } catch (err) {
    dailyError = err instanceof ApiError ? err.message : "Failed to load daily consumption history.";
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
      <Link href={backHref} className="text-sm text-foreground-muted transition-colors hover:text-accent">
        ← Back to Households
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{meter}</h1>

      <div className="mt-6">
        <HouseholdProfile household={household} />
      </div>

      <HouseholdAiAgent meter={meter} />

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Weekday vs Weekend</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          This household&apos;s own weekday/weekend consumption averages.
        </p>
        <div className="mt-4">
          <WeekdayWeekendComparison
            weekdayAvg={household.average_weekday_consumption}
            weekendAvg={household.average_weekend_consumption}
            ratio={household.weekend_vs_weekday_ratio}
          />
        </div>
      </section>

      {dailyError ? (
        <div className={`mt-10 ${CARD} p-6 text-sm text-foreground-muted`}>
          Could not load daily consumption history: {dailyError}
        </div>
      ) : (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Daily Consumption</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Full recorded daily consumption history for {meter}.
          </p>
          <div className={`mt-4 ${CARD} p-4`}>
            <HouseholdDailyChart rows={daily ?? []} />
          </div>
        </section>
      )}
    </main>
  );
}
