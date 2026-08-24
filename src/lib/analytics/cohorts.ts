import type { TelemetryRecord } from "../fixtures/types";
import { metricValue, selectRows, uniqueDevices, unitFor } from "./rows";
import type {
  BreakdownDimension,
  CohortSlice,
  TelemetryFilter,
  TelemetryMetric,
} from "./types";

export function cohortSize(
  rows: readonly TelemetryRecord[],
  filter: TelemetryFilter = {},
): { n_devices: number; device_days: number } {
  const selected = selectRows(rows, filter);
  return {
    n_devices: uniqueDevices(selected),
    device_days: selected.length,
  };
}

export function breakdown(
  rows: readonly TelemetryRecord[],
  metric: TelemetryMetric,
  dimension: BreakdownDimension,
  filter: TelemetryFilter = {},
): CohortSlice[] {
  const selected = selectRows(rows, filter);
  const keys = [...new Set(selected.map((row) => String(row[dimension])))].sort();
  const unit = unitFor(metric);
  return keys.map((key) => {
    const slice = selected.filter((row) => String(row[dimension]) === key);
    const device_days = slice.length;
    const total = slice.reduce((sum, row) => sum + metricValue(row, metric), 0);
    return {
      key,
      n_devices: uniqueDevices(slice),
      device_days,
      rate: {
        value: device_days === 0 ? 0 : total / device_days,
        unit,
      },
    };
  });
}
