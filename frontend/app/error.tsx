"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">API unavailable</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        Could not load data from the backend. Make sure the FastAPI server is running at{" "}
        <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.08]">
          {process.env.NEXT_PUBLIC_API_URL}
        </code>
        .
      </p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{error.message}</p>
      <button
        onClick={reset}
        className="mt-2 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Retry
      </button>
    </main>
  );
}
