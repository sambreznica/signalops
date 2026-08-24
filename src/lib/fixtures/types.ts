import type {
  ActivityLevel,
  AppVersion,
  Channel,
  Cohort,
  ConsequenceClass,
  FirmwareVersion,
  Region,
  SupportTag,
} from "./constants";

export type DeviceRecord = {
  device_id: string;
  region: Region;
  cohort: Cohort;
};

export type TelemetryRecord = {
  device_id: string;
  date: string;
  firmware_version: FirmwareVersion;
  app_version: AppVersion;
  region: Region;
  cohort: Cohort;
  ble_disconnects_24h: number;
  session_gap_minutes: number;
  adhesion_flag: boolean;
  activity_level: ActivityLevel;
  motion_intensity: number;
  skin_temp_delta_c: number;
  battery_drain_pct: number;
};

export type FeedbackRecord = {
  id: string;
  timestamp: string;
  channel: Channel;
  device_id: string;
  firmware_version: FirmwareVersion;
  app_version: AppVersion;
  region: Region;
  text: string;
  tags: SupportTag[];
};

export type TagTaxonomyEntry = {
  tag: SupportTag;
  consequence_class: ConsequenceClass;
  weight: number;
};

export type SignalGroundTruth = {
  id: "SIG-001" | "SIG-002" | "SIG-003" | "SIG-004";
  is_real: boolean;
  authorial_severity: "HIGH" | "MEDIUM" | "LOW" | null;
  claims_risk: boolean;
  feedback_ids: string[];
  device_ids: string[];
};

export type SignalsSidecar = {
  signals: SignalGroundTruth[];
};

export type FixtureBundle = {
  devices: DeviceRecord[];
  telemetry: TelemetryRecord[];
  feedback: FeedbackRecord[];
  taxonomy: TagTaxonomyEntry[];
  signals: SignalsSidecar;
};
