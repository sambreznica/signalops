/** Keys the harness may use and the agent must never see. */
export const GROUND_TRUTH_KEYS = [
  "ground_truth_cluster",
  "is_real",
  "authorial_severity",
  "claims_risk",
  "signal_id",
  "expected_severity",
  "expected_band",
  "feedback_ids",
  "device_ids",
  "ground_truth",
] as const;

export type GroundTruthKey = (typeof GROUND_TRUTH_KEYS)[number];

export function strip<T extends Record<string, unknown>>(
  record: T,
): Omit<T, GroundTruthKey> {
  const next: Record<string, unknown> = { ...record };
  for (const key of GROUND_TRUTH_KEYS) {
    delete next[key];
  }
  return next as Omit<T, GroundTruthKey>;
}
