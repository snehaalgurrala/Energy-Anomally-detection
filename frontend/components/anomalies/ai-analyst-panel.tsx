"use client";

import { explainAnomaly } from "@/lib/api";
import { AiExplainPanel } from "@/components/ai-explain-panel";

export function AiAnalystPanel({ meter, day }: { meter: string; day: string }) {
  return (
    <AiExplainPanel
      heading="AI Analysis"
      description="AI-generated interpretation of the anomaly data shown above -- not part of the detection itself."
      idlePrompt="Ask the AI analyst to explain this anomaly in plain language, grounded only in the data shown above."
      explainLabel="Explain this anomaly"
      loadingLabel="Analyzing this anomaly…"
      followUpPlaceholder="Ask a follow-up about this anomaly…"
      explain={(question) => explainAnomaly(meter, day, question ? { question } : {})}
    />
  );
}
