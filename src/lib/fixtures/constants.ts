export const SYNTHETIC_TODAY = "2026-05-18";
export const PRIOR_WINDOW_START = "2026-04-20";
export const PRIOR_WINDOW_END = "2026-05-03";
export const CURRENT_WINDOW_START = "2026-05-04";
export const CURRENT_WINDOW_END = "2026-05-17";

export const FIXTURE_SEED = 20260518;
export const DEVICE_COUNT = 400;
export const DATES_PER_DEVICE = 6;
export const DATES_PER_WINDOW = 3;
export const TELEMETRY_COUNT = DEVICE_COUNT * DATES_PER_DEVICE;
export const FEEDBACK_COUNT = 500;
export const RESOLVER_CELL_MIN = 30;
export const RESOLVER_CELL_SIZE = 32;
export const FIRMWARE_142_ROLLOUT = 100;
export const SIG_003_TICKET_COUNT = 18;

export const FIRMWARE_VERSIONS = [
  "1.2.0",
  "1.3.0",
  "1.4.0",
  "1.4.1",
  "1.4.2",
] as const;

export const APP_VERSIONS = ["3.0", "3.1", "3.2"] as const;

export const REGIONS = ["uk", "nordics", "iberia", "dach", "benelux"] as const;
export const CHANNELS = [
  "support_ticket",
  "beta_forum",
  "in_app_survey",
  "app_store_review",
] as const;
export const COHORTS = [
  "beta_wave_1",
  "beta_wave_2",
  "internal_dogfood",
] as const;
export const ACTIVITY_LEVELS = [
  "low",
  "moderate",
  "high",
  "very_high",
] as const;

export const CONSEQUENCE_CLASSES = [
  "REGULATORY",
  "SAFETY_ADJACENT",
  "FUNCTIONAL",
  "COSMETIC",
] as const;

export const TAG_TAXONOMY = [
  { tag: "claims-interpretation", consequence_class: "REGULATORY", weight: 2.0 },
  { tag: "data-privacy", consequence_class: "REGULATORY", weight: 2.0 },
  { tag: "adhesion", consequence_class: "SAFETY_ADJACENT", weight: 1.5 },
  { tag: "skin-irritation", consequence_class: "SAFETY_ADJACENT", weight: 1.5 },
  { tag: "overheating", consequence_class: "SAFETY_ADJACENT", weight: 1.5 },
  { tag: "connectivity", consequence_class: "FUNCTIONAL", weight: 1.0 },
  { tag: "battery", consequence_class: "FUNCTIONAL", weight: 1.0 },
  { tag: "app-sync", consequence_class: "FUNCTIONAL", weight: 1.0 },
  { tag: "data-accuracy", consequence_class: "FUNCTIONAL", weight: 1.0 },
  { tag: "packaging", consequence_class: "COSMETIC", weight: 0.5 },
  { tag: "app-ui", consequence_class: "COSMETIC", weight: 0.5 },
  { tag: "comfort-fit", consequence_class: "COSMETIC", weight: 0.5 },
] as const;

export const CLUSTER_TAGS = {
  "SIG-001": ["connectivity", "app-sync"],
  "SIG-002": ["adhesion", "skin-irritation", "comfort-fit"],
  "SIG-003": ["claims-interpretation", "data-accuracy"],
  "SIG-004": ["battery", "overheating", "app-ui"],
} as const;

export type FirmwareVersion = (typeof FIRMWARE_VERSIONS)[number];
export type AppVersion = (typeof APP_VERSIONS)[number];
export type Region = (typeof REGIONS)[number];
export type Channel = (typeof CHANNELS)[number];
export type Cohort = (typeof COHORTS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type ConsequenceClass = (typeof CONSEQUENCE_CLASSES)[number];
export type SupportTag = (typeof TAG_TAXONOMY)[number]["tag"];
