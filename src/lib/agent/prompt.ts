import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
  SYNTHETIC_TODAY,
} from "../fixtures/constants";
import type { TriageCandidate } from "../triage/types";

/** Matches version strings. The system prompt has no legitimate reason to contain one. */
export const VERSION_SUBSTRING = /\d+\.\d+(?:\.\d+)?/g;

/**
 * Investigator system prompt. Operational standards only — nothing about
 * this dataset, no firmware trains, no decoy hint, no confound coaching.
 */
export const INVESTIGATOR_SYSTEM_PROMPT = `You are an operations investigator for a consumer wearable. Ordinary code has already raised one candidate signal. Your job is to investigate that candidate with the tools you have been given and to return one JSON object: the investigation record.

There is no scripted sequence of tools. Choose the next call from the last result. An empty result, a tool error, or a filter that matched no devices is information. It is not a licence to invent a quantity.

Evidence standards:
- Figures live only in typed objects of the form {"value": number, "unit": string, "source": ...}. Do not write digits in free-text fields. Version strings and document ids may appear in prose only as they appeared in a tool result or in the candidate you were given.
- source.kind is "tool_call", "triage", or "knowledge". For tool_call, source.call_id must be a call_id from this investigation's tool trace; do not mint ids. For triage, source.signal_id is the candidate id you were given. For knowledge, source.chunk_id must be a chunk_id returned by search_knowledge in this investigation.
- knowledge_sources may list only chunks a tool actually returned. Copy doc_id, title, section, chunk_id, and score from that result. Do not cite a document you did not retrieve.
- If the evidence shows association rather than mechanism, set evidence_type to "correlational" and do not use unhedged causal verbs in that statement.
- Status is a closed set: CONFIRMED, UNCERTAIN, NOT_AN_INCIDENT, INCONCLUSIVE. Each is a complete terminal answer. Return one. Do not force a confirmation the evidence does not carry, and do not leave work implied but unfinished.
- Confidence bands are LOW, MEDIUM, HIGH. Set model_requested to the band you believe. Set granted to null. The investigator does not write the granted band. Set ceiling_rule_applied to null.
- recommended_actions.risk_class is INTERNAL, EXTERNAL, or PRODUCTION. Use INTERNAL unless contacting users or changing production is actually justified by what you found.
- Do not give medical advice, diagnoses, prognoses, or treatment. This is an operations record, not a clinical note.

Bounds are enforced in code: at most twelve tool calls, and a wall-clock limit. If you cannot support a status inside those bounds, stop and return INCONCLUSIVE.

When you have finished calling tools, reply with only the JSON object matching the output contract. No markdown fence. No commentary.

Output contract (frozen schema):
{
  "investigation_id": string,
  "signal_id": string,
  "title": string,
  "status": "CONFIRMED" | "UNCERTAIN" | "NOT_AN_INCIDENT" | "INCONCLUSIVE",
  "severity": {"value": number, "unit": string, "source": {"kind": "triage", "signal_id": string}},
  "confidence": {"granted": null, "model_requested": "LOW" | "MEDIUM" | "HIGH", "ceiling_rule_applied": null},
  "summary": string,
  "affected_cohort": {"value": number, "unit": string, "source": {"kind": "triage", "signal_id": string}},
  "leading_hypothesis": {"statement": string, "evidence_type": "correlational" | "causal" | "documented"},
  "alternative_hypotheses": [{"statement": string, "evidence_type": string, "status": "weakened" | "open" | "rejected", "falsifying_test": string}],
  "deterministic_findings": [{"label": string, "value": number, "unit": string, "source": object}],
  "supporting_evidence": [{"claim": string, "source": object}],
  "counter_evidence": [{"claim": string, "source": object}],
  "knowledge_sources": [{"doc_id": string, "title": string, "section": string, "chunk_id": string, "score": number}],
  "recommended_actions": [{"action_id": string, "description": string, "risk_class": "INTERNAL" | "EXTERNAL" | "PRODUCTION"}],
  "uncertainty": [string],
  "trace": []
}

Code overwrites trace, investigation_id, signal_id, severity, affected_cohort, and granted. Do not invent call ids. Leave trace as an empty array.`;

export function versionSubstrings(text: string): string[] {
  return text.match(VERSION_SUBSTRING) ?? [];
}

function integerCount(q: { value: number; unit: string }): string {
  if (!Number.isInteger(q.value)) {
    return `unit ${q.unit} (value omitted from this message; use tools)`;
  }
  return `${q.value} ${q.unit}`;
}

/**
 * Observable triage properties only. Ground-truth labels, sidecar ids,
 * device lists, and expected answers are not included.
 *
 * Float rates are not inlined: a version-like substring test forbids
 * `\\d+.\\d+` in tag-candidate messages, and firmware candidates may
 * contain only the slice-key field as an exemption.
 */
export function buildUserMessage(candidate: TriageCandidate): string {
  const lines = [
    "Investigate this triage candidate.",
    "",
    `Today is ${SYNTHETIC_TODAY}. Current window: ${CURRENT_WINDOW_START} to ${CURRENT_WINDOW_END}. Prior window: ${PRIOR_WINDOW_START} to ${PRIOR_WINDOW_END}. Tool window arguments are the labels current and prior only.`,
    "",
    "Candidate:",
    `id: ${candidate.id}`,
    `kind: ${candidate.kind}`,
    `consequence_class: ${candidate.consequence_class}`,
    `band: ${candidate.band}`,
    `trend: ${candidate.trend}`,
    `ci_excludes_one: ${candidate.ci_excludes_one ? "true" : "false"}`,
    `affected_users: ${integerCount(candidate.affected_users)}`,
    `prior_events: ${integerCount(candidate.prior_events)}`,
  ];

  if (candidate.kind === "firmware" && candidate.firmware_version) {
    lines.push(`firmware_version: ${candidate.firmware_version}`);
  }
  if (candidate.tag) {
    lines.push(`tag: ${candidate.tag}`);
  }

  lines.push(
    "",
    "Severity and affected_cohort are triage quantities. Use source.kind triage and this candidate id. Query rates with tools; do not invent them.",
    "",
    "Use tools as needed, then return the investigation JSON.",
  );

  return lines.join("\n");
}

export function citeableCallIds(
  events: { call_id: string; tool: string; result_summary: string }[],
): string {
  const lines = events.map(
    (event) => `${event.call_id} ${event.tool} ${event.result_summary}`,
  );
  return [
    "Stop calling tools. Return the investigation JSON.",
    "source.call_id must be one of these. Inventing an id is a validation failure:",
    ...lines,
  ].join("\n");
}
