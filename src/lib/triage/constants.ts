import type { ConsequenceClass } from "../fixtures/constants";

export const FLEET_SATURATION_FRACTION = 0.2;
export const HIGH_THRESHOLD = 0.9;
export const MEDIUM_THRESHOLD = 0.45;
export const THIN_PRIOR_EVENTS = 5;
export const THIN_PRIOR_DELTA_CAP = 0.2;
export const TREND_FACTOR = {
  rising: 1.0,
  flat: 0.6,
  falling: 0.3,
} as const;

export const CONSEQUENCE_WEIGHT: Record<ConsequenceClass, number> = {
  REGULATORY: 2.0,
  SAFETY_ADJACENT: 1.5,
  FUNCTIONAL: 1.0,
  COSMETIC: 0.5,
};
