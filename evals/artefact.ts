import { z } from "zod";
import { investigationOutputSchema } from "../src/lib/schema/investigation";

export const investigationRecordSchema = z.strictObject({
  candidate_id: z.string(),
  output: investigationOutputSchema,
  pre_critic: investigationOutputSchema.nullable(),
  metrics: z.strictObject({
    tool_calls: z.number(),
    tokens: z.number(),
    wall_clock_ms: z.number(),
  }),
});

export const certificationRunSchema = z.strictObject({
  run_id: z.string(),
  timestamp: z.string(),
  model: z.string(),
  temperature: z.literal(0),
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

export type InvestigationRecord = z.infer<typeof investigationRecordSchema>;
export type CertificationRun = z.infer<typeof certificationRunSchema>;
