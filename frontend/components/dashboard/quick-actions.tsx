"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { AnalystChat } from "@/components/analyst/analyst-chat";
import { Modal } from "@/components/modal";
import { AnalystIcon, AnomalyIcon, HouseholdIcon } from "@/components/nav-icons";
import { CARD } from "@/lib/format";

const ACTION_CARD =
  `group flex flex-col items-start gap-3 ${CARD} p-5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover`;

const ICON_CHIP =
  "flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-inset ring-accent-border";

function ActionCardBody({
  Icon,
  title,
  description,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
}) {
  return (
    <>
      <span className={ICON_CHIP}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-foreground-muted">{description}</p>
      </div>
      <span className="mt-auto text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
        Open →
      </span>
    </>
  );
}

// Dashboard entry points to the app's three main surfaces. Anomalies and
// Households are plain navigation; "Talk to AI Analyst" instead opens the
// AI Analyst as a modal overlay on top of the dashboard -- it's no longer a
// separate /analyst nav destination (see components/analyst/analyst-chat.tsx,
// reused here unmodified aside from its optional close button).
export function QuickActions() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Quick Actions</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Jump into anomaly analysis, household analysis, or ask the AI Analyst.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/anomalies" className={ACTION_CARD}>
          <ActionCardBody
            Icon={AnomalyIcon}
            title="Anomalies"
            description="Open the anomaly explorer: trends, segments, and flagged readings."
          />
        </Link>
        <Link href="/households" className={ACTION_CARD}>
          <ActionCardBody
            Icon={HouseholdIcon}
            title="Households"
            description="Open household analysis: consumption profiles and comparisons."
          />
        </Link>
        <button type="button" onClick={() => setChatOpen(true)} className={ACTION_CARD}>
          <ActionCardBody
            Icon={AnalystIcon}
            title="Talk to AI Analyst"
            description="Ask questions about anomalies, meters, and trends in plain language."
          />
        </button>
      </div>

      <Modal open={chatOpen} onClose={() => setChatOpen(false)} panelClassName="w-full max-w-5xl">
        <AnalystChat onClose={() => setChatOpen(false)} />
      </Modal>
    </section>
  );
}
