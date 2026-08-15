export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-6 py-16">
      <p role="status" aria-live="polite" className="text-sm text-zinc-500 dark:text-zinc-400">
        Loading household profile…
      </p>
    </main>
  );
}
