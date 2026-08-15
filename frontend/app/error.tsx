"use client";

import { ApiError } from "@/lib/api";
import { PILL_BUTTON } from "@/lib/format";
import { StatusMessage } from "@/components/status-message";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isApiError = error instanceof ApiError;

  return (
    <StatusMessage
      title={isApiError ? "API unavailable" : "Something went wrong"}
      description={
        isApiError ? (
          <>
            Could not load data from the backend. Make sure the FastAPI server is running at{" "}
            <code className="rounded bg-background px-1 py-0.5 text-foreground-muted">
              {process.env.NEXT_PUBLIC_API_URL}
            </code>
            .
          </>
        ) : (
          "An unexpected error occurred. Please try again."
        )
      }
      detail={error.message}
      action={
        <button onClick={reset} className={`mt-2 ${PILL_BUTTON} py-2`}>
          Retry
        </button>
      }
    />
  );
}
