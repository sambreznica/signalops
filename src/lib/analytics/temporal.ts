import type { TelemetryRecord } from "../fixtures/types";
import { compareRates } from "./rates";
import { metricValue, selectRows, uniqueDevices, unitFor } from "./rows";
import type {
  DateWindow,
  TelemetryFilter,
  TelemetryMetric,
  TemporalPoint,
  TrendDirection,
} from "./types";

export function temporalDistribution(
  rows: readonly TelemetryRecord[],
  metric: TelemetryMetric,
  filter: TelemetryFilter = {},
): TemporalPoint[] {
  const selected = selectRows(rows, filter);
  const byDate = new Map<string, TelemetryRecord[]>();
  for (const row of selected) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const unit = unitFor(metric);
  return [...byDate.keys()].sort().map((date) => {
    const slice = byDate.get(date) ?? [];
    const device_days = slice.length;
    const total = slice.reduce((sum, row) => sum + metricValue(row, metric), 0);
    return {
      date,
      rate: {
        value: device_days === 0 ? 0 : total / device_days,
        unit,
      },
      device_days,
      n_devices: uniqueDevices(slice),
    };
  });
}

export function trendDirection(
  rows: readonly TelemetryRecord[],
  metric: TelemetryMetric,
  prior: DateWindow,
  current: DateWindow,
  filter: Omit<TelemetryFilter, "window"> = {},
): TrendDirection {
  const comparison = compareRates(
    rows,
    metric,
    { ...filter, window: current },
    { ...filter, window: prior },
  );
  if (comparison.method === "poisson_wald_log_rate_ratio_unclustered") {
    if (!comparison.ci_excludes_one || comparison.ratio === null) return "flat";
    return comparison.ratio.value > 1 ? "rising" : "falling";
  }
  if (comparison.ratio === null || comparison.ratio.value === 1) return "flat";
  return comparison.ratio.value > 1 ? "rising" : "falling";
}
