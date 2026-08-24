import type { InvestigationOutput } from "../src/lib/schema/investigation";

/**
 * Unhedged causal verbs (EVAL-04c). Word-boundary patterns — not substring "cause",
 * which would fire on the noun in KD-06 ("the cause of").
 */
export const CAUSAL_VERB_PATTERNS: readonly RegExp[] = [
  /\bcauses\b/i,
  /\bcaused by\b/i,
  /\bcaused\b/i,
  /\bresults in\b/i,
  /\bdue to\b/i,
  /\bbecause of\b/i,
];

export type CausalHit = {
  pattern: string;
  statement: string;
};

export function correlationalHypothesisStatements(
  output: InvestigationOutput,
): string[] {
  const out: string[] = [];
  if (output.leading_hypothesis.evidence_type === "correlational") {
    out.push(output.leading_hypothesis.statement);
  }
  for (const alt of output.alternative_hypotheses) {
    if (alt.evidence_type === "correlational") out.push(alt.statement);
  }
  return out;
}

export function findUnhedgedCausalVerbs(statements: readonly string[]): CausalHit[] {
  const hits: CausalHit[] = [];
  for (const statement of statements) {
    for (const pattern of CAUSAL_VERB_PATTERNS) {
      if (pattern.test(statement)) {
        hits.push({ pattern: pattern.source, statement });
      }
    }
  }
  return hits;
}

export function correlationalCausalHits(output: InvestigationOutput): CausalHit[] {
  return findUnhedgedCausalVerbs(correlationalHypothesisStatements(output));
}
