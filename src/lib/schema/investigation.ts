import { z } from "zod";
import { provenanceSchema, quantitySchema } from "./quantity";

export const statusSchema = z.enum([
  "CONFIRMED",
  "UNCERTAIN",
  "NOT_AN_INCIDENT",
  "INCONCLUSIVE",
]);

export const confidenceBandSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const ceilingRuleSchema = z.enum([
  "correlational_evidence",
  "unrebutted_counter_evidence",
  "cohort_below_25",
]);

export const evidenceTypeSchema = z.enum([
  "correlational",
  "causal",
  "documented",
]);

export const alternativeHypothesisStatusSchema = z.enum([
  "weakened",
  "open",
  "rejected",
]);

export const riskClassSchema = z.enum(["INTERNAL", "EXTERNAL", "PRODUCTION"]);

export const actorSchema = z.enum(["investigator", "critic"]);

export const toolNameSchema = z.enum([
  "query_telemetry",
  "compare_versions",
  "search_feedback",
  "search_knowledge",
  "find_similar_incidents",
]);

export const confidenceSchema = z.strictObject({
  /**
   * Null until the ceiling (item 11) writes it. The investigator must not
   * copy model_requested here — a missing ceiling must not silently pass.
   */
  granted: confidenceBandSchema.nullable(),
  model_requested: confidenceBandSchema,
  ceiling_rule_applied: ceilingRuleSchema.nullable(),
});

export const leadingHypothesisSchema = z.strictObject({
  statement: z.string(),
  evidence_type: evidenceTypeSchema,
});

export const alternativeHypothesisSchema = z.strictObject({
  statement: z.string(),
  evidence_type: evidenceTypeSchema,
  status: alternativeHypothesisStatusSchema,
  falsifying_test: z.string(),
});

export const deterministicFindingSchema = z.strictObject({
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  source: provenanceSchema,
});

export const evidenceItemSchema = z.strictObject({
  claim: z.string(),
  source: provenanceSchema,
});

export const knowledgeSourceSchema = z.strictObject({
  doc_id: z.string(),
  title: z.string(),
  section: z.string(),
  chunk_id: z.string(),
  score: z.number(),
});

export const recommendedActionSchema = z.strictObject({
  action_id: z.string(),
  description: z.string(),
  risk_class: riskClassSchema,
});

const toolCallEventSchema = z.strictObject({
  kind: z.literal("tool_call"),
  call_id: z.string(),
  actor: actorSchema,
  tool: toolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
  result_summary: z.string(),
  latency_ms: z.number(),
  tokens: z.number(),
});

const ceilingAppliedEventSchema = z.strictObject({
  kind: z.literal("ceiling_applied"),
  requested: confidenceBandSchema,
  granted: confidenceBandSchema,
  rule: ceilingRuleSchema,
});

const criticEffectEventSchema = z.strictObject({
  kind: z.literal("critic_effect"),
  effect: z.string(),
  detail: z.string(),
});

export const traceEventSchema = z.discriminatedUnion("kind", [
  toolCallEventSchema,
  ceilingAppliedEventSchema,
  criticEffectEventSchema,
]);

export const investigationOutputSchema = z.strictObject({
  investigation_id: z.string(),
  signal_id: z.string(),
  title: z.string(),
  status: statusSchema,
  severity: quantitySchema,
  confidence: confidenceSchema,
  summary: z.string(),
  affected_cohort: quantitySchema,
  leading_hypothesis: leadingHypothesisSchema,
  alternative_hypotheses: z.array(alternativeHypothesisSchema),
  deterministic_findings: z.array(deterministicFindingSchema),
  supporting_evidence: z.array(evidenceItemSchema),
  counter_evidence: z.array(evidenceItemSchema),
  knowledge_sources: z.array(knowledgeSourceSchema),
  recommended_actions: z.array(recommendedActionSchema),
  uncertainty: z.array(z.string()),
  trace: z.array(traceEventSchema),
});

export type Status = z.infer<typeof statusSchema>;
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;
export type CeilingRule = z.infer<typeof ceilingRuleSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type RiskClass = z.infer<typeof riskClassSchema>;
export type ToolName = z.infer<typeof toolNameSchema>;
export type TraceEvent = z.infer<typeof traceEventSchema>;
export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;
