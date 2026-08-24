import type {
  ActivityLevel,
  AppVersion,
  Cohort,
  ConsequenceClass,
  FirmwareVersion,
  Region,
  SupportTag,
} from "../fixtures/constants";

/** Numeric payload without provenance. Tools attach `source` later. */
export type Measured = {
  value: number;
  unit: string;
};

export type DateWindow = {
  start: string;
  end: string;
};

export type TelemetryFilter = {
  window?: DateWindow;
  firmware_version?: FirmwareVersion;
  app_version?: AppVersion;
  region?: Region;
  cohort?: Cohort;
};

export type TelemetryMetric =
  | "ble_disconnects_24h"
  | "session_gap_minutes"
  | "adhesion_flag"
  | "motion_intensity"
  | "skin_temp_delta_c"
  | "battery_drain_pct";

export type CorrelateVariable = TelemetryMetric | "activity_level";

export type RateResult = {
  rate: Measured;
  device_days: number;
  n_devices: number;
  event_total: number;
};

export type RateComparison = {
  rate_a: Measured;
  rate_b: Measured;
  ratio: Measured | null;
  ratio_ci_low: number | null;
  ratio_ci_high: number | null;
  ci_excludes_one: boolean;
  method:
    | "poisson_wald_log_rate_ratio_unclustered"
    | "mean_ratio_unintervalled";
  device_days_a: number;
  device_days_b: number;
  n_devices_a: number;
  n_devices_b: number;
  event_total_a: number;
  event_total_b: number;
};

export type TrendDirection = "rising" | "flat" | "falling";

export type CohortSlice = {
  key: string;
  n_devices: number;
  device_days: number;
  rate: Measured;
};

export type BreakdownDimension =
  | "firmware_version"
  | "app_version"
  | "region"
  | "cohort"
  | "activity_level";

export type TemporalPoint = {
  date: string;
  rate: Measured;
  device_days: number;
  n_devices: number;
};

export type CorrelationMethod = "point_biserial" | "spearman" | "pearson";

export type CorrelationResult = {
  pairing: [CorrelateVariable, CorrelateVariable];
  method: CorrelationMethod;
  coefficient: number;
  n_pairs: number;
  n_devices: number;
};

export type TagStat = {
  tag: SupportTag;
  consequence_class: ConsequenceClass;
  n_tickets: number;
  n_devices: number;
};

export type { ActivityLevel, ConsequenceClass, SupportTag };
