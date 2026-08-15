// Shared route-level loading state (used by every route's loading.tsx) so
// navigating between pages always shows the same spinner/label treatment.
export function PageLoading({ label }: { label: string }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-6 py-16">
      <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-foreground-muted">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent"
        />
        {label}
      </div>
    </main>
  );
}
