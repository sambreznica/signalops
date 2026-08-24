import type { ActivityLevel } from "../fixtures/constants";
import type { TelemetryRecord } from "../fixtures/types";
import type {
  CorrelateVariable,
  DateWindow,
  TelemetryFilter,
  TelemetryMetric,
} from "./types";

const COUNT_METRICS = new Set<TelemetryMetric>([
  "ble_disconnects_24h",
  "adhesion_flag",
]);

export function isCountMetric(metric: TelemetryMetric): boolean {
  return COUNT_METRICS.has(metric);
}

export function unitFor(metric: TelemetryMetric): string {
  switch (metric) {
    case "ble_disconnects_24h":
      return "disconnects_per_device_day";
    case "session_gap_minutes":
      return "minutes_per_device_day";
    case "adhesion_flag":
      return "flags_per_device_day";
    case "motion_intensity":
      return "intensity_per_device_day";
    case "skin_temp_delta_c":
      return "celsius_per_device_day";
    case "battery_drain_pct":
      return "percent_per_device_day";
  }
}

export function inWindow(date: string, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

export function matchesFilter(
  row: TelemetryRecord,
  filter: TelemetryFilter,
): boolean {
  if (filter.window && !inWindow(row.date, filter.window)) return false;
  if (
    filter.firmware_version !== undefined &&
    row.firmware_version !== filter.firmware_version
  ) {
    return false;
  }
  if (filter.app_version !== undefined && row.app_version !== filter.app_version) {
    return false;
  }
  if (filter.region !== undefined && row.region !== filter.region) return false;
  if (filter.cohort !== undefined && row.cohort !== filter.cohort) return false;
  return true;
}

export function selectRows(
  rows: readonly TelemetryRecord[],
  filter: TelemetryFilter = {},
): TelemetryRecord[] {
  return rows.filter((row) => matchesFilter(row, filter));
}

export function metricValue(row: TelemetryRecord, metric: TelemetryMetric): number {
  if (metric === "adhesion_flag") return row.adhesion_flag ? 1 : 0;
  return row[metric];
}

const ACTIVITY_RANK: Record<ActivityLevel, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  very_high: 4,
};

export function correlateValue(
  row: TelemetryRecord,
  variable: CorrelateVariable,
): number {
  if (variable === "activity_level") return ACTIVITY_RANK[row.activity_level];
  return metricValue(row, variable);
}

export function isBinaryVariable(variable: CorrelateVariable): boolean {
  return variable === "adhesion_flag";
}

export function isOrdinalVariable(variable: CorrelateVariable): boolean {
  return variable === "activity_level";
}

export function uniqueDevices(rows: readonly TelemetryRecord[]): number {
  return new Set(rows.map((row) => row.device_id)).size;
}
