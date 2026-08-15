"use client";

import { useState, type ReactNode, type SVGProps } from "react";
import { Modal } from "@/components/modal";
import { CloseIcon } from "@/components/icons";
import { CARD } from "@/lib/format";

const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
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
      {...props}
    >
      <path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-4.2 3.4A.5.5 0 0 1 4 19v-3H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}

// Contextual AI agent for detail pages: a fixed bottom-right trigger button
// that opens a floating chat-style panel. Only ever rendered by detail
// pages themselves (anomaly detail, household detail) -- never on list
// pages or the dashboard -- so it stays scoped to "this record" rather than
// becoming a second, competing entry point to the AI Analyst. The panel's
// contents (children) are only mounted once `open` is true, so nothing
// inside it -- e.g. an AiExplainPanel with `autoRun` -- fires a request
// before the user has actually clicked the button.
export function FloatingAiAgent({
  buttonLabel,
  panelTitle,
  panelDescription,
  children,
}: {
  buttonLabel: string;
  panelTitle: string;
  panelDescription: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={buttonLabel}
        className="fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 transition-all duration-150 hover:scale-105 hover:bg-accent-hover active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background md:right-8 md:bottom-8"
      >
        <ChatIcon className="h-6 w-6" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="floating-ai-agent-title"
        panelClassName="w-full max-w-lg"
      >
        <div className={`flex max-h-[80vh] min-h-[26rem] flex-col ${CARD}`}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id="floating-ai-agent-title" className="text-base font-semibold tracking-tight text-foreground">
                {panelTitle}
              </h2>
              <p className="mt-0.5 truncate text-xs text-foreground-subtle">{panelDescription}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={ICON_BUTTON}>
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{open && children}</div>
        </div>
      </Modal>
    </>
  );
}
