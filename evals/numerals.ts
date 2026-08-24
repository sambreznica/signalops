import type {
  InvestigationOutput,
  TraceEvent,
} from "../src/lib/schema/investigation";

/**
 * Bare numerals in free text (EVAL-04b). Version strings (1.4.2) and document
 * ids (KD-02) are allowed so EVAL-02 can pass alongside this check.
 */
export function hasBareNumeral(text: string): boolean {
  const stripped = text
    .replace(/\bKD-\d+\b/gi, " ")
    .replace(/\b\d+\.\d+(?:\.\d+)?\b/g, " ");
  return /\d/.test(stripped);
}

function traceFreeText(event: TraceEvent): string[] {
  if (event.kind === "tool_call") return [event.result_summary];
  if (event.kind === "ceiling_applied") return [];
  return [event.effect, event.detail];
}

export function freeTextFields(output: InvestigationOutput): string[] {
  return [
    output.title,
    output.summary,
    output.leading_hypothesis.statement,
    ...output.alternative_hypotheses.flatMap((h) => [
      h.statement,
      h.falsifying_test,
    ]),
    ...output.deterministic_findings.map((f) => f.label),
    ...output.supporting_evidence.map((e) => e.claim),
    ...output.counter_evidence.map((e) => e.claim),
    ...output.recommended_actions.map((a) => a.description),
    ...output.uncertainty,
    ...output.trace.flatMap(traceFreeText),
  ];
}

export function bareNumeralHits(output: InvestigationOutput): string[] {
  return freeTextFields(output).filter(hasBareNumeral);
}
