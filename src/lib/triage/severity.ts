import {
  CONSEQUENCE_WEIGHT,
  FLEET_SATURATION_FRACTION,
  HIGH_THRESHOLD,
  MEDIUM_THRESHOLD,
  THIN_PRIOR_DELTA_CAP,
  THIN_PRIOR_EVENTS,
  TREND_FACTOR,
} from "./constants";
import type { SeverityBand, SeverityInputs, SeverityResult } from "./types";

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeSeverity(inputs: SeverityInputs): SeverityResult {
  const denom = FLEET_SATURATION_FRACTION * inputs.fleet_size;
  const affected_factor = denom <= 0 ? 0 : Math.min(inputs.affected_users / denom, 1);
  const ratio =
    inputs.rate_prior === 0 ? null : inputs.rate_window / inputs.rate_prior;
  let delta_factor = ratio === null ? 0 : clamp(ratio, 1, 5) / 5;
  const delta_factor_floored = inputs.prior_events < THIN_PRIOR_EVENTS;
  if (delta_factor_floored) {
    delta_factor = Math.min(delta_factor, THIN_PRIOR_DELTA_CAP);
  }
  const trend_factor = TREND_FACTOR[inputs.trend];
  const consequence_weight = CONSEQUENCE_WEIGHT[inputs.consequence_class];
  const severity_index =
    (0.5 * affected_factor + 0.5 * delta_factor) *
    trend_factor *
    consequence_weight;
  let band: SeverityBand = "LOW";
  if (severity_index >= HIGH_THRESHOLD) band = "HIGH";
  else if (severity_index >= MEDIUM_THRESHOLD) band = "MEDIUM";
  return {
    affected_factor,
    ratio,
    delta_factor,
    delta_factor_floored,
    trend_factor,
    consequence_weight,
    severity_index,
    band,
  };
}
