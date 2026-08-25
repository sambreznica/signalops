import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
  SYNTHETIC_TODAY,
} from "../fixtures/constants";
import type { InvestigationOutput } from "../schema";
import type { TriageCandidate } from "../triage/types";

/**
 * Critic system prompt. Falsification only — no evaluative framing,
 * no dataset identity, no version strings, no outcome-coaching.
 */
export const CRITIC_SYSTEM_PROMPT = `You are an operations worker for a consumer wearable. Someone else wrote a leading hypothesis about a candidate signal. You did not write it. Your job is to produce a falsifying test for that hypothesis.

A falsifying test is a specific observation that cannot hold if the leading hypothesis is true. Name at least one alternative hypothesis that could account for the same observations, and name the falsifying test for the leading hypothesis. You may call tools to make that observation.

You receive the leading hypothesis, typed findings, retrieved passages, supporting and counter claims, residual uncertainty, the stated status, and the candidate identity. You do not receive a confidence band.

Do not write a second investigation record. Return a patch. Code applies it.

Evidence standards:
- Figures live only in typed objects of the form {"value": number, "unit": string, "source": ...}. The only way to state a figure in a free-text field is a reference of the form {f_1}, {f_2}, and so on, where the id is a deterministic_findings id. Digits in free-text are unrepresentable. Version strings, document ids, metric names, and incident or known-issue ids are names, not figures, and may appear as they appeared in a tool result or in the pack you were given.
- source.kind is "tool_call", "triage", or "knowledge". For tool_call, source.call_id must be a call_id from this investigation. For knowledge, source.chunk_id must be a chunk_id returned by search_knowledge.
- If the evidence shows association rather than mechanism, set evidence_type to "correlational" and do not use unhedged causal verbs in that statement.
- Status may move only downward: from CONFIRMED toward UNCERTAIN, INCONCLUSIVE, or NOT_AN_INCIDENT; from UNCERTAIN toward INCONCLUSIVE or NOT_AN_INCIDENT; from INCONCLUSIVE toward NOT_AN_INCIDENT. Do not raise status. Do not reopen NOT_AN_INCIDENT.
- Confidence bands are LOW, MEDIUM, HIGH. You may include model_requested. Code keeps it only when it does not raise the existing band. Do not write granted.
- Do not give medical advice, diagnoses, prognoses, or treatment.

Bounds are enforced in code: at most four tool calls, at most two tool-use turns, and a wall-clock limit.

When you have finished calling tools, reply with only the JSON object matching the patch contract. No markdown fence. No commentary.

Patch contract:
{
  "alternative_hypotheses": [{"statement": string, "evidence_type": "correlational" | "causal" | "documented", "status": "weakened" | "open" | "rejected", "falsifying_test": string}],
  "status": "CONFIRMED" | "UNCERTAIN" | "NOT_AN_INCIDENT" | "INCONCLUSIVE",
  "model_requested": "LOW" | "MEDIUM" | "HIGH",
  "leading_hypothesis": {"statement": string, "evidence_type": "correlational" | "causal" | "documented"},
  "counter_evidence": [{"claim": string, "source": object}],
  "uncertainty": [string],
  "summary": string
}

alternative_hypotheses is required and must contain at least one entry with a non-empty falsifying_test. Every other key is optional.`;

function investigationPack(output: InvestigationOutput) {
  return {
    status: output.status,
    title: output.title,
    summary: output.summary,
    leading_hypothesis: output.leading_hypothesis,
    deterministic_findings: output.deterministic_findings,
    knowledge_sources: output.knowledge_sources,
    supporting_evidence: output.supporting_evidence,
    counter_evidence: output.counter_evidence,
    uncertainty: output.uncertainty,
  };
}

function callIds(output: InvestigationOutput): string[] {
  return output.trace
    .filter((event) => event.kind === "tool_call")
    .map((event) => event.call_id);
}

export function buildCriticUserMessage(
  candidate: TriageCandidate,
  output: InvestigationOutput,
): string {
  const lines = [
    "Produce a falsifying test for this leading hypothesis.",
    "",
    `Today is ${SYNTHETIC_TODAY}. Current window: ${CURRENT_WINDOW_START} to ${CURRENT_WINDOW_END}. Prior window: ${PRIOR_WINDOW_START} to ${PRIOR_WINDOW_END}. Tool window arguments are the labels current and prior only.`,
    "",
    "Candidate:",
    `id: ${candidate.id}`,
    `kind: ${candidate.kind}`,
    `consequence_class: ${candidate.consequence_class}`,
  ];
  if (candidate.kind === "firmware" && candidate.firmware_version) {
    lines.push(`firmware_version: ${candidate.firmware_version}`);
  }
  if (candidate.tag) {
    lines.push(`tag: ${candidate.tag}`);
  }
  lines.push("", "Pack:", JSON.stringify(investigationPack(output), null, 2));
  const ids = callIds(output);
  if (ids.length > 0) {
    lines.push(
      "",
      "source.call_id must be one of these. Inventing an id is a validation failure:",
      ...ids,
    );
  }
  return lines.join("\n");
}
