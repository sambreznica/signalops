/**
 * Sampling is not a controllable parameter on Claude Sonnet 5 / Opus 5.
 * Do not send temperature, top_p, or top_k — the API rejects them.
 * Adaptive thinking is always on. Effort is the only remaining knob.
 */
export const EFFORT_LEVELS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * Investigator effort. Not the API default (`high`).
 *
 * Medium: this loop is capped at 12 tool calls. Wall-clock is calibrated
 * to that call budget at measured API latency (180s), not an independent
 * cap. Critic has its own 4 / 90s. High/max/xhigh spend thinking tokens
 * and extra tool calls that compete with that budget.
 * Low would under-investigate (EVAL-02/03 need a real branch, not a skim).
 */
export const INVESTIGATOR_EFFORT: EffortLevel = "medium";

/** Same effort as the investigator. Not tuned to chase a bound. */
export const CRITIC_EFFORT: EffortLevel = "medium";

export function investigatorOutputConfig(): { effort: EffortLevel } {
  return { effort: INVESTIGATOR_EFFORT };
}

export function criticOutputConfig(): { effort: EffortLevel } {
  return { effort: CRITIC_EFFORT };
}
