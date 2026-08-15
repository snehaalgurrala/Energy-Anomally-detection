"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApiError, sendChatMessage } from "@/lib/api";
import { CloseIcon } from "@/components/icons";
import { CARD, PILL_BUTTON, PILL_BUTTON_PRIMARY } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";

type Status = "idle" | "loading" | "error";

const SUGGESTED_QUESTIONS = [
  "Summarize the dashboard",
  "What are the biggest energy anomalies?",
  "Which meters have the highest anomaly rates?",
  "Which segments have the highest anomaly rates?",
  "What should I investigate first?",
  "What patterns do you see in the anomaly trends?",
];

const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

// Full chat experience for the AI Analyst modal (see
// components/dashboard/quick-actions.tsx): message history, empty-state
// suggestions, typing indicator, and a follow-up-aware input. Conversation
// state lives entirely client-side (the backend is stateless per request --
// each call resends the full transcript) and grounding is enforced server
// side by /api/ai/chat, the same way the dashboard/anomaly explain panels do.
export function AnalystChat({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function runChat(nextMessages: ChatMessage[]) {
    setStatus("loading");
    setError(null);
    try {
      const result = await sendChatMessage({ messages: nextMessages });
      setMessages([...nextMessages, { role: "assistant", content: result.message }]);
      setStatus("idle");
    } catch (err) {
      // Keep the user's message visible (with the retry banner below it)
      // rather than dropping it, so retrying doesn't require retyping.
      setMessages(nextMessages);
      setError(err instanceof ApiError ? err.message : "Unexpected error.");
      setStatus("error");
    }
  }

  function handleSend(text?: string) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || status === "loading") return;
    setInput("");
    void runChat([...messages, { role: "user", content: trimmed }]);
  }

  function handleRetry() {
    if (messages.length === 0) return;
    void runChat(messages);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    setInput("");
    setStatus("idle");
    setError(null);
  }

  const hasMessages = messages.length > 0;

  return (
    <div className={`flex h-[75vh] min-h-[420px] flex-col ${CARD}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-foreground">AI Analyst</h1>
          <p className="mt-0.5 truncate text-xs text-foreground-subtle">
            Grounded in the dashboard&apos;s current anomaly and household data.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasMessages && status === "idle"}
            className={`${PILL_BUTTON} py-1.5 text-xs`}
          >
            New conversation
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6" role="log" aria-live="polite">
        {!hasMessages ? (
          <div className="flex h-full items-center justify-center">
            <EmptyChatState onSelect={handleSend} />
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {status === "loading" && <TypingIndicator />}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          <span>Could not reach the AI analyst: {error}</span>
          <button type="button" onClick={handleRetry} className={`${PILL_BUTTON} shrink-0 py-1 text-xs`}>
            Retry
          </button>
        </div>
      )}

      <div className="border-t border-border px-5 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about anomalies, meters, segments, or trends…"
            rows={1}
            disabled={status === "loading"}
            aria-label="Message the AI Analyst"
            className="min-h-[2.5rem] max-h-40 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-subtle transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={status === "loading" || !input.trim()}
            className={`${PILL_BUTTON_PRIMARY} h-10 shrink-0`}
          >
            {status === "loading" ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-xs text-foreground-subtle">
          Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}

function EmptyChatState({ onSelect }: { onSelect: (question: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-inset ring-accent-border">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-accent"
        >
          <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
          <path d="M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" />
          <circle cx="12" cy="12" r="3.25" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Ask the AI Analyst</h2>
        <p className="mt-1.5 text-sm text-foreground-muted">
          Ask about anomalies, meters, segments, or trends. Answers are grounded only in the data
          currently on this dashboard.
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className={`${CARD} px-3.5 py-2.5 text-left text-sm text-foreground-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-foreground`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  // Mirrors ai-explain-panel's paragraph rendering: the backend returns
  // plain text (short paragraphs, occasionally a "- " bullet list), so
  // split on blank lines rather than every newline.
  const paragraphs = message.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          isUser
            ? "bg-surface-active text-foreground-muted"
            : "bg-accent text-white shadow-sm shadow-accent/40"
        }`}
      >
        {isUser ? "You" : "AI"}
      </span>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "rounded-tr-sm bg-accent text-white"
            : "rounded-tl-sm border border-border bg-surface-hover text-foreground-muted"
        }`}
      >
        <div className="space-y-2 whitespace-pre-line">
          {paragraphs.length > 0 ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p>{message.content}</p>}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white shadow-sm shadow-accent/40"
      >
        AI
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-surface-hover px-4 py-3.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle" />
      </div>
    </div>
  );
}
