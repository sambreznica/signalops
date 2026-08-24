import { z } from "zod";

/**
 * Unified provenance for every Quantity and every evidence item.
 * Amendment to PRD §14 / FR-046 — see docs/build-decisions.md.
 *
 * Resolution (eval harness, not this schema):
 *   tool_call  → trace[]
 *   triage     → triage output
 *   knowledge  → knowledge_sources[]
 */
export const provenanceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("tool_call"),
    call_id: z.string(),
  }),
  z.strictObject({
    kind: z.literal("triage"),
    signal_id: z.string(),
  }),
  z.strictObject({
    kind: z.literal("knowledge"),
    chunk_id: z.string(),
  }),
]);

export type Provenance = z.infer<typeof provenanceSchema>;

/** Any numeric outside trace[] and knowledge_sources[] must be this object. */
export const quantitySchema = z.strictObject({
  value: z.number(),
  unit: z.string(),
  source: provenanceSchema,
});

export type Quantity = z.infer<typeof quantitySchema>;
