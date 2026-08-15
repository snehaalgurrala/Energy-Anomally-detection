import { CARD } from "@/lib/format";

// Shared "no results" placeholder for filtered lists (anomalies, high-anomaly
// households, household explorer) so the three don't drift into their own
// empty-state treatments.
export function EmptyState({ message }: { message: string }) {
  return (
    <div className={`${CARD} flex flex-col items-center gap-3 p-10 text-center`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="text-foreground-subtle"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 7.5 12 3l8.25 4.5v9L12 21l-8.25-4.5v-9Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5 12 12m0 0 8.25-4.5M12 12v9" />
      </svg>
      <p className="text-sm text-foreground-muted">{message}</p>
    </div>
  );
}
