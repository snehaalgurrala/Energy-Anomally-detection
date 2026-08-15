import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getAnomalyDetail, getMeterHistory } from "@/lib/api";
import { CARD, formatDay } from "@/lib/format";
import { AnomalyDetail } from "@/components/anomalies/anomaly-detail";
import { MeterHistoryChart } from "@/components/anomalies/meter-history-chart";
import { MeterHistoryTable } from "@/components/anomalies/meter-history-table";

// Detail depends on the specific meter/day in the URL, so this route is
// always rendered per request rather than statically prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ meter: string; day: string }>;
}): Promise<Metadata> {
  const { meter, day } = await params;
  return { title: `${meter} · ${formatDay(day)} · Energy Anomaly Detection` };
}

export default async function AnomalyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ meter: string; day: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { meter, day } = await params;
  const { from } = await searchParams;
  const backHref = from ? `/anomalies?${from}` : "/anomalies";

  let detail;
  try {
    detail = await getAnomalyDetail(meter, day);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let history = null;
  let historyError: string | null = null;
  try {
    history = await getMeterHistory(meter);
  } catch (err) {
    historyError = err instanceof ApiError ? err.message : "Failed to load meter history.";
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <Link href={backHref} className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Back to Anomalies
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {meter} <span className="text-zinc-400 dark:text-zinc-500">·</span> {formatDay(day)}
      </h1>

      <div className="mt-6">
        <AnomalyDetail record={detail} />
      </div>

      {historyError ? (
        <div className={`mt-10 ${CARD} p-6 text-sm text-zinc-500 dark:text-zinc-400`}>
          Could not load meter history: {historyError}
        </div>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Consumption vs Expected</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Actual vs. expected consumption for {meter}, with the selected date and anomalies marked.
            </p>
            <div className={`mt-4 ${CARD} p-4`}>
              <MeterHistoryChart rows={history ?? []} selectedDay={day} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Meter history</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Chronological consumption and anomaly context for {meter}.
            </p>
            <div className="mt-4">
              <MeterHistoryTable key={`${meter}-${day}`} rows={history ?? []} selectedDay={day} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
