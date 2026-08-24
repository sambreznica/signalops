import type { TelemetryRecord } from "../fixtures/types";
import { isCountMetric, metricValue, selectRows, uniqueDevices, unitFor } from "./rows";
import type { RateComparison, RateResult, TelemetryFilter, TelemetryMetric } from "./types";

const Z_95 = 1.959963984540054;

export function rateInWindow(
  rows: readonly TelemetryRecord[],
  metric: TelemetryMetric,
  filter: TelemetryFilter = {},
): RateResult {
  const selected = selectRows(rows, filter);
  const device_days = selected.length;
  const event_total = selected.reduce(
    (sum, row) => sum + metricValue(row, metric),
    0,
  );
  return {
    rate: {
      value: device_days === 0 ? 0 : event_total / device_days,
      unit: unitFor(metric),
    },
    device_days,
    n_devices: uniqueDevices(selected),
    event_total,
  };
}

function poissonWald(
  eventsA: number,
  daysA: number,
  eventsB: number,
  daysB: number,
): {
  ratio: number | null;
  low: number | null;
  high: number | null;
  excludes: boolean;
} {
  if (eventsA <= 0 || eventsB <= 0 || daysA <= 0 || daysB <= 0) {
    return { ratio: null, low: null, high: null, excludes: false };
  }
  const ratio = eventsA / daysA / (eventsB / daysB);
  const logRr = Math.log(ratio);
  const se = Math.sqrt(1 / eventsA + 1 / eventsB);
  return {
    ratio,
    low: Math.exp(logRr - Z_95 * se),
    high: Math.exp(logRr + Z_95 * se),
    excludes: Math.exp(logRr - Z_95 * se) > 1 || Math.exp(logRr + Z_95 * se) < 1,
  };
}

export function compareRates(
  rows: readonly TelemetryRecord[],
  metric: TelemetryMetric,
  filterA: TelemetryFilter,
  filterB: TelemetryFilter,
): RateComparison {
  const a = rateInWindow(rows, metric, filterA);
  const b = rateInWindow(rows, metric, filterB);

  if (isCountMetric(metric)) {
    const interval = poissonWald(
      a.event_total,
      a.device_days,
      b.event_total,
      b.device_days,
    );
    return {
      rate_a: a.rate,
      rate_b: b.rate,
      ratio:
        interval.ratio === null
          ? null
          : { value: interval.ratio, unit: "ratio" },
      ratio_ci_low: interval.low,
      ratio_ci_high: interval.high,
      ci_excludes_one: interval.excludes,
      method: "poisson_wald_log_rate_ratio_unclustered",
      device_days_a: a.device_days,
      device_days_b: b.device_days,
      n_devices_a: a.n_devices,
      n_devices_b: b.n_devices,
      event_total_a: a.event_total,
      event_total_b: b.event_total,
    };
  }

  const ratioValue =
    a.device_days === 0 || b.device_days === 0 || b.rate.value === 0
      ? null
      : a.rate.value / b.rate.value;

  return {
    rate_a: a.rate,
    rate_b: b.rate,
    ratio: ratioValue === null ? null : { value: ratioValue, unit: "ratio" },
    ratio_ci_low: null,
    ratio_ci_high: null,
    ci_excludes_one: false,
    method: "mean_ratio_unintervalled",
    device_days_a: a.device_days,
    device_days_b: b.device_days,
    n_devices_a: a.n_devices,
    n_devices_b: b.n_devices,
    event_total_a: a.event_total,
    event_total_b: b.event_total,
  };
}
