"use client";

import { explainDashboard } from "@/lib/api";
import { AiExplainPanel } from "@/components/ai-explain-panel";

export function AiEnergyIntelligencePanel() {
  return (
    <AiExplainPanel
      heading="AI Energy Intelligence"
      description="AI-generated interpretation of the anomaly summary above -- not part of the detection itself."
      idlePrompt="Ask the AI analyst to summarize current anomaly activity in plain language, grounded only in the dashboard data shown above."
      explainLabel="Summarize dashboard"
      loadingLabel="Analyzing dashboard data…"
      followUpPlaceholder="Ask a follow-up about the dashboard…"
      explain={(question) => explainDashboard(question ? { question } : {})}
    />
  );
}
