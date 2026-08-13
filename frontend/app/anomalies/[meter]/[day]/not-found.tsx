import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Anomaly not found</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        No record exists for this meter and date combination.
      </p>
      <Link
        href="/anomalies"
        className="mt-2 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Back to Anomalies
      </Link>
    </main>
  );
}
