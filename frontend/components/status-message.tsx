import type { ReactNode } from "react";

// Shared centered title/description/action layout behind the app's
// error, not-found, and other full-page status states, so they all read
// as the same design language instead of three ad hoc layouts.
export function StatusMessage({
  title,
  description,
  detail,
  action,
}: {
  title: string;
  description: ReactNode;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-foreground-muted">{description}</p>
      {detail && <p className="text-xs text-foreground-subtle">{detail}</p>}
      {action}
    </main>
  );
}
