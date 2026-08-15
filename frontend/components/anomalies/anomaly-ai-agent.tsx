"use client";

import { explainAnomaly } from "@/lib/api";
import { AiExplainPanel } from "@/components/ai-explain-panel";
import { FloatingAiAgent } from "@/components/floating-ai-agent";

// Contextual AI agent for one anomaly detail page. Opening the panel
// auto-runs the equivalent of "Explain this anomaly" (explain() with no
// question falls through to the backend's default explanation question,
// same as the old inline AI Analysis panel did) against the existing
// POST /api/ai/anomalies/{meter}/{day}/explain endpoint -- no new endpoint.
export function AnomalyAiAgent({ meter, day }: { meter: string; day: string }) {
  return (
    <FloatingAiAgent
      buttonLabel="Ask the AI Analyst about this anomaly"
      panelTitle="AI Analyst"
      panelDescription={`Grounded in ${meter}'s anomaly data for this date.`}
    >
      <AiExplainPanel
        idlePrompt="Ask the AI analyst to explain this anomaly in plain language, grounded only in its data."
        explainLabel="Explain this anomaly"
        loadingLabel="Analyzing this anomaly…"
        followUpPlaceholder="Ask a follow-up about this anomaly…"
        explain={(question) => explainAnomaly(meter, day, question ? { question } : {})}
        autoRun
      />
    </FloatingAiAgent>
  );
}
