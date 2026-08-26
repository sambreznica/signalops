import { z } from "zod";
import { investigationOutputSchema } from "../src/lib/schema/investigation";

export const stopReasonSchema = z.enum([
  "completed",
  "wall_clock",
  "call_cap",
  "validation_exhausted",
]);

export const investigationRecordSchema = z.strictObject({
  candidate_id: z.string(),
  output: investigationOutputSchema,
  pre_critic: investigationOutputSchema.nullable(),
  /**
   * Explicit stop. Absent on older artefacts — those used `bound_stopped`,
   * which conflated wall-clock, call cap, and repair exhaustion.
   */
  stop_reason: stopReasonSchema.optional(),
  /** Set when stop_reason is validation_exhausted. Not an output free-text field. */
  validation_error: z.string().nullable().optional(),
  /** Last failed model text when validation_exhausted. Artefact metadata, not scored prose. */
  validation_emit: z.string().nullable().optional(),
  /**
   * Legacy. True meant any of wall-clock / call cap / validation.
   * New writes omit this field. Readers use `recordIsCompleted`.
   */
  bound_stopped: z.boolean().optional(),
  metrics: z.strictObject({
    tool_calls: z.number(),
    tokens: z.number(),
    wall_clock_ms: z.number(),
    cache_hits: z.number(),
    cache_misses: z.number(),
  }),
});

export const certificationRunSchema = z.strictObject({
  run_id: z.string(),
  timestamp: z.string(),
  model: z.string(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  n: z.union([z.literal(1), z.literal(3)]),
  kind: z.enum(["agent", "baseline"]),
  investigations: z.array(investigationRecordSchema),
  approvals: z.array(
    z.strictObject({
      action_id: z.string(),
      at: z.string(),
    }),
  ),
  execution_log: z.array(
    z.strictObject({
      action_id: z.string(),
      at: z.string(),
    }),
  ),
});

export type StopReason = z.infer<typeof stopReasonSchema>;
export type InvestigationRecord = z.infer<typeof investigationRecordSchema>;
export type CertificationRun = z.infer<typeof certificationRunSchema>;

/** Completed means a parseable synthesis. All other stop reasons skip the critic. */
export function recordIsCompleted(row: InvestigationRecord): boolean {
  if (row.stop_reason !== undefined) return row.stop_reason === "completed";
  return row.bound_stopped !== true;
}
