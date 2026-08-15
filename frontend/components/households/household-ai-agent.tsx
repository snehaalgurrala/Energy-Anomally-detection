"use client";

import { explainHousehold } from "@/lib/api";
import { AiExplainPanel } from "@/components/ai-explain-panel";
import { FloatingAiAgent } from "@/components/floating-ai-agent";

// Contextual AI agent for one household detail page -- same pattern as
// AnomalyAiAgent, grounded in POST /api/ai/households/{meter}/explain.
export function HouseholdAiAgent({ meter }: { meter: string }) {
  return (
    <FloatingAiAgent
      buttonLabel="Ask the AI Analyst about this household"
      panelTitle="AI Analyst"
      panelDescription={`Grounded in ${meter}'s household consumption data.`}
    >
      <AiExplainPanel
        idlePrompt="Ask the AI analyst to explain this household's consumption profile in plain language, grounded only in its data."
        explainLabel="Explain this household"
        loadingLabel="Analyzing this household…"
        followUpPlaceholder="Ask a follow-up about this household…"
        explain={(question) => explainHousehold(meter, question ? { question } : {})}
        autoRun
      />
    </FloatingAiAgent>
  );
}
