"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { CARD, FIELD, PILL_BUTTON } from "@/lib/format";

type Status = "idle" | "loading" | "error" | "ready";

const BUTTON = `${PILL_BUTTON} py-1.5 hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#1a1a1a]`;

// Shared idle/loading/error/ready + follow-up UI and state machine behind
// both the per-anomaly AI Analysis panel and the dashboard AI Energy
// Intelligence panel, so the two don't drift apart. Callers supply their own
// copy and the fetch call (`explain`); everything else -- state, error
// handling, paragraph rendering, the follow-up form -- lives here once.
export function AiExplainPanel({
  heading,
  description,
  idlePrompt,
  explainLabel,
  loadingLabel,
  followUpPlaceholder,
  explain,
}: {
  heading: string;
  description: string;
  idlePrompt: string;
  explainLabel: string;
  loadingLabel: string;
  followUpPlaceholder: string;
  explain: (question?: string) => Promise<{ analysis: string }>;
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
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>

      <div className={`mt-4 ${CARD} p-5`}>
        {status === "idle" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{idlePrompt}</p>
            <button type="button" onClick={handleExplain} className={BUTTON}>
              {explainLabel}
            </button>
          </div>
        )}

        {status === "loading" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{loadingLabel}</p>
        )}

        {status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Could not load AI analysis: {error}</p>
            <button type="button" onClick={handleExplain} className={BUTTON}>
              Try again
            </button>
          </div>
        )}

        {status === "ready" && (
          <div className="flex flex-col gap-4">
            <div className="space-y-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>

            <form
              onSubmit={handleFollowUp}
              className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-4 dark:border-white/15"
            >
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
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Could not load AI analysis: {followUpError}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
