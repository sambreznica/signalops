import type {
  CeilingRule,
  ConfidenceBand,
  EvidenceType,
  InvestigationOutput,
  TraceEvent,
} from "../schema";
import { investigationOutputSchema } from "../schema";

const BAND_RANK: Record<ConfidenceBand, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export type CeilingDecisionInput = {
  requested: ConfidenceBand;
  evidence_type: EvidenceType;
  affected_cohort: number;
  unrebutted_critic_counter_evidence: boolean;
};

export type CeilingDecision = {
  granted: ConfidenceBand;
  rule: CeilingRule | null;
};

/**
 * HIGH is unavailable when any FR-042 rule holds. The cap is MEDIUM, not LOW.
 * Rules are checked in FR-042 order so a live correlational run records
 * `correlational_evidence` even when cohort < 25 also holds.
 */
export function ceilingDecision(input: CeilingDecisionInput): CeilingDecision {
  const firing: CeilingRule[] = [];
  if (input.evidence_type === "correlational") {
    firing.push("correlational_evidence");
  }
  if (input.unrebutted_critic_counter_evidence) {
    firing.push("unrebutted_counter_evidence");
  }
  if (input.affected_cohort < 25) {
    firing.push("cohort_below_25");
  }

  const cap: ConfidenceBand = firing.length > 0 ? "MEDIUM" : "HIGH";
  const granted =
    BAND_RANK[input.requested] <= BAND_RANK[cap] ? input.requested : cap;
  const overridden = BAND_RANK[granted] < BAND_RANK[input.requested];
  return {
    granted,
    rule: overridden ? (firing[0] ?? null) : null,
  };
}

export function criticAppendedCounterEvidence(
  post: InvestigationOutput,
  investigator: InvestigationOutput,
): boolean {
  const prior = new Set(investigator.counter_evidence.map((item) => item.claim));
  return post.counter_evidence.some((item) => !prior.has(item.claim));
}

/**
 * Sole writer of `confidence.granted`. Reads post-critic `model_requested`.
 * Investigator-listed counter-evidence does not fire the critic rule.
 */
export function applyCeiling(
  output: InvestigationOutput,
  investigator: InvestigationOutput,
): InvestigationOutput {
  const decision = ceilingDecision({
    requested: output.confidence.model_requested,
    evidence_type: output.leading_hypothesis.evidence_type,
    affected_cohort: output.affected_cohort.value,
    unrebutted_critic_counter_evidence: criticAppendedCounterEvidence(
      output,
      investigator,
    ),
  });

  const trace: TraceEvent[] = output.trace.filter(
    (event) => event.kind !== "ceiling_applied",
  );
  if (decision.rule !== null) {
    trace.push({
      kind: "ceiling_applied",
      requested: output.confidence.model_requested,
      granted: decision.granted,
      rule: decision.rule,
    });
  }

  return investigationOutputSchema.parse({
    ...output,
    confidence: {
      model_requested: output.confidence.model_requested,
      granted: decision.granted,
      ceiling_rule_applied: decision.rule,
    },
    trace,
  });
}
