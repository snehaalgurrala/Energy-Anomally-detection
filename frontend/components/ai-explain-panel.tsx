"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { FIELD, PILL_BUTTON_PRIMARY } from "@/lib/format";

type Status = "idle" | "loading" | "error" | "ready";

const BUTTON = `${PILL_BUTTON_PRIMARY} py-1.5`;

// Shared idle/loading/error/ready + follow-up UI and state machine behind
// every AI explanation surface in the app (the contextual floating agent on
// anomaly and household detail pages), so they don't drift apart. Callers
// supply their own copy and the fetch call (`explain`); everything else --
// state, error handling, paragraph rendering, the follow-up form -- lives
// here once. Deliberately has no heading/card chrome of its own: callers
// render this inside their own container (see components/floating-ai-agent.tsx).
export function AiExplainPanel({
  idlePrompt,
  explainLabel,
  loadingLabel,
  followUpPlaceholder,
  explain,
  autoRun = false,
}: {
  idlePrompt: string;
  explainLabel: string;
  loadingLabel: string;
  followUpPlaceholder: string;
  explain: (question?: string) => Promise<{ analysis: string }>;
  autoRun?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [followUpPending, setFollowUpPending] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  async function handleExplain() {
    setStatus("loading");
    setError(null);
    try {
      const result = await explain();
      setAnalysis(result.analysis);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error.");
      setStatus("error");
    }
  }

  // Fires the initial explanation automatically once, when a caller opts in
  // (the floating agent does, on panel open) instead of waiting for the
  // idle-state button to be clicked -- this component is only ever mounted
  // once the user has already asked to open the panel, so this is not a
  // request made on page load. Deferred via setTimeout (rather than calling
  // handleExplain -- and its synchronous setStatus("loading") -- directly in
  // the effect body) so the state update happens in a callback, not
  // synchronously during the effect itself.
  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(() => void handleExplain(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFollowUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || followUpPending) return;

    setFollowUpPending(true);
    setFollowUpError(null);
    try {
      const result = await explain(trimmed);
      setAnalysis(result.analysis);
      setQuestion("");
    } catch (err) {
      setFollowUpError(err instanceof ApiError ? err.message : "Unexpected error.");
    } finally {
      setFollowUpPending(false);
    }
  }

  // The backend returns plain text (short paragraphs, occasionally a "- "
  // bullet list); split on blank lines only so bullet lines stay grouped
  // under their paragraph instead of one <p> per line.
  const paragraphs = analysis
    ? analysis.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-4">
      {status === "idle" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-foreground-muted">{idlePrompt}</p>
          <button type="button" onClick={handleExplain} className={BUTTON}>
            {explainLabel}
          </button>
        </div>
      )}

      {status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-foreground-muted">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent"
          />
          {loadingLabel}
        </p>
      )}

      {status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">Could not load AI analysis: {error}</p>
          <button type="button" onClick={handleExplain} className={BUTTON}>
            Try again
          </button>
        </div>
      )}

      {status === "ready" && (
        <div className="flex flex-col gap-4">
          <div className="space-y-2 whitespace-pre-line text-sm leading-relaxed text-foreground-muted">
            {paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          <form onSubmit={handleFollowUp} className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={followUpPlaceholder}
              disabled={followUpPending}
              className={`${FIELD} min-w-[16rem] flex-1`}
            />
            <button type="submit" disabled={followUpPending || !question.trim()} className={BUTTON}>
              {followUpPending ? "Asking…" : "Ask"}
            </button>
          </form>

          {followUpError && (
            <p className="text-sm text-danger">Could not load AI analysis: {followUpError}</p>
          )}
        </div>
      )}
    </div>
  );
}
