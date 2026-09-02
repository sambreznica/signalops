import { z } from "zod";
import type { CertificationRun, InvestigationRecord } from "./artefact";
import type { HarnessContext } from "./load";
import { primaryCandidate } from "./load";
import type { EmbeddingIndex } from "../src/lib/retrieval/types";
import {
  alternativeHypothesisSchema,
  confidenceBandSchema,
  investigationOutputSchema,
  leadingHypothesisSchema,
  riskClassSchema,
  statusSchema,
  type InvestigationOutput,
} from "../src/lib/schema/investigation";
import type { SignalGroundTruth } from "../src/lib/fixtures/types";
import type { TriageCandidate } from "../src/lib/triage/types";

export const BASELINE_RUN_ID = "run-baseline";

export const BASELINE_SUBJECT_KEYS = [
  "firmware",
  "skin_irritation",
  "claims_interpretation",
  "overheating",
] as const;

export type BaselineSubjectKey = (typeof BASELINE_SUBJECT_KEYS)[number];

/** Harness-only. Never interpolated into the model prompt. */
export const SUBJECT_TO_SIDECAR: Record<
  BaselineSubjectKey,
  SignalGroundTruth["id"]
> = {
  firmware: "SIG-001",
  skin_irritation: "SIG-002",
  claims_interpretation: "SIG-003",
  overheating: "SIG-004",
};

const findingEmitSchema = z.strictObject({
  label: z.string(),
  value: z.number(),
  unit: z.string(),
});

const actionEmitSchema = z.strictObject({
  description: z.string(),
  risk_class: riskClassSchema,
});

export const baselineSubjectSchema = z.strictObject({
  title: z.string(),
  status: statusSchema,
  summary: z.string(),
  model_requested: confidenceBandSchema,
  leading_hypothesis: leadingHypothesisSchema,
  alternative_hypotheses: z.array(alternativeHypothesisSchema),
  findings: z.array(findingEmitSchema),
  knowledge_chunk_ids: z.array(z.string()),
  recommended_actions: z.array(actionEmitSchema),
  uncertainty: z.array(z.string()),
});

export const baselineEmitSchema = z.strictObject({
  firmware: baselineSubjectSchema,
  skin_irritation: baselineSubjectSchema,
  claims_interpretation: baselineSubjectSchema,
  overheating: baselineSubjectSchema,
});

export type BaselineEmit = z.infer<typeof baselineEmitSchema>;
export type BaselineSubject = z.infer<typeof baselineSubjectSchema>;

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```/m.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("no JSON object in model response");
  }
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Fill omitted arrays so a near-complete emit can parse. */
export function normaliseBaselineEmit(raw: unknown): unknown {
  const root = asRecord(raw);
  if (!root) return raw;
  const next: Record<string, unknown> = { ...root };
  for (const key of BASELINE_SUBJECT_KEYS) {
    const subject = asRecord(next[key]);
    if (!subject) continue;
    next[key] = {
      ...subject,
      alternative_hypotheses: subject.alternative_hypotheses ?? [],
      findings: subject.findings ?? [],
      knowledge_chunk_ids: subject.knowledge_chunk_ids ?? [],
      recommended_actions: subject.recommended_actions ?? [],
      uncertainty: subject.uncertainty ?? [],
    };
  }
  return next;
}

function resolveChunks(
  ids: readonly string[],
  index: EmbeddingIndex,
): InvestigationOutput["knowledge_sources"] {
  const seen = new Set<string>();
  const sources: InvestigationOutput["knowledge_sources"] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const chunk = index.chunks.find((c) => c.chunk_id === id);
    if (!chunk) continue;
    sources.push({
      doc_id: chunk.doc_id,
      title: chunk.title,
      section: chunk.section,
      chunk_id: chunk.chunk_id,
      score: 0,
    });
  }
  return sources;
}

export function stampSubject(
  subject: BaselineSubject,
  candidate: TriageCandidate,
  index: EmbeddingIndex,
): InvestigationOutput {
  const knowledge_sources = resolveChunks(subject.knowledge_chunk_ids, index);
  const listed = new Set(knowledge_sources.map((k) => k.chunk_id));
  const triageSource = { kind: "triage" as const, signal_id: candidate.id };

  const findings = subject.findings.map((row, i) => ({
    id: `f_${i + 1}`,
    label: row.label,
    value: row.value,
    unit: row.unit,
    source: triageSource,
  }));

  return investigationOutputSchema.parse({
    investigation_id: `inv_${candidate.id}`,
    signal_id: candidate.id,
    title: subject.title,
    status: subject.status,
    severity: candidate.severity_index,
    confidence: {
      granted: null,
      model_requested: subject.model_requested,
      ceiling_rule_applied: null,
    },
    summary: subject.summary,
    affected_cohort: candidate.affected_users,
    leading_hypothesis: subject.leading_hypothesis,
    alternative_hypotheses: subject.alternative_hypotheses,
    deterministic_findings: findings,
    supporting_evidence: [],
    counter_evidence: [],
    knowledge_sources,
    recommended_actions: subject.recommended_actions.map((row, i) => ({
      action_id: `act_${candidate.id}_${i + 1}`,
      description: row.description,
      risk_class: row.risk_class,
    })),
    uncertainty: subject.uncertainty,
    trace: [],
  });
}

export function recordsFromEmit(
  emit: BaselineEmit,
  ctx: HarnessContext,
  wallClockMs: number,
  tokens: number,
): InvestigationRecord[] {
  const rows: InvestigationRecord[] = [];
  for (const key of BASELINE_SUBJECT_KEYS) {
    const sidecarId = SUBJECT_TO_SIDECAR[key];
    const candidate = primaryCandidate(ctx, sidecarId);
    if (!candidate) {
      throw new Error(`no triage primary for ${sidecarId} (${key})`);
    }
    const output = stampSubject(emit[key], candidate, ctx.embeddings);
    rows.push({
      candidate_id: candidate.id,
      output,
      pre_critic: null,
      stop_reason: "completed",
      validation_error: null,
      validation_emit: null,
      validation_attempts: [],
      metrics: {
        tool_calls: 0,
        tokens: Math.round(tokens / BASELINE_SUBJECT_KEYS.length),
        wall_clock_ms: Math.round(wallClockMs / BASELINE_SUBJECT_KEYS.length),
        cache_hits: 0,
        cache_misses: 0,
      },
    });
  }
  return rows;
}

export function buildBaselineRun(args: {
  emit: BaselineEmit;
  ctx: HarnessContext;
  model: string;
  wallClockMs: number;
  tokens: number;
}): CertificationRun {
  return {
    run_id: BASELINE_RUN_ID,
    timestamp: new Date().toISOString(),
    model: args.model,
    effort: "medium",
    n: 1,
    kind: "baseline",
    investigations: recordsFromEmit(
      args.emit,
      args.ctx,
      args.wallClockMs,
      args.tokens,
    ),
    approvals: [],
    execution_log: [],
  };
}
