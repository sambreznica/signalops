import { cohortSize, compareRates } from "../../analytics";
import type { TelemetryFilter } from "../../analytics/types";
import type { AppVersion, FirmwareVersion } from "../../fixtures/constants";
import type { CompareVersionsArgs } from "./args";
import { asCount, asQuantity } from "./quantity";
import type { ToolErr, ToolOk, ToolRuntime } from "./types";
import { emptyReason } from "./types";
import { resolveWindow } from "./windows";

export function runCompareVersions(
  args: CompareVersionsArgs,
  runtime: ToolRuntime,
  call_id: string,
): ToolOk | ToolErr {
  const window_resolved = resolveWindow(args.window);
  const window = { start: window_resolved.start, end: window_resolved.end };

  const shared: TelemetryFilter = {
    window,
    region: args.hold?.region,
    cohort: args.hold?.cohort,
  };
  if (args.axis === "firmware_version") {
    shared.app_version = args.hold?.app_version;
  } else {
    shared.firmware_version = args.hold?.firmware_version;
  }

  const filterA: TelemetryFilter = { ...shared };
  const filterB: TelemetryFilter = { ...shared };
  if (args.axis === "firmware_version") {
    filterA.firmware_version = args.version_a as FirmwareVersion;
    filterB.firmware_version = args.version_b as FirmwareVersion;
  } else {
    filterA.app_version = args.version_a as AppVersion;
    filterB.app_version = args.version_b as AppVersion;
  }

  const n_devices_in_window = cohortSize(runtime.telemetry, { window }).n_devices;
  const comparison = compareRates(
    runtime.telemetry,
    args.metric,
    filterA,
    filterB,
  );
  const empty_reason_a = emptyReason(
    comparison.n_devices_a,
    comparison.event_total_a,
  );
  const empty_reason_b = emptyReason(
    comparison.n_devices_b,
    comparison.event_total_b,
  );

  return {
    ok: true,
    metric: args.metric,
    axis: args.axis,
    version_a: args.version_a,
    version_b: args.version_b,
    window_resolved,
    n_devices_in_window: asCount(n_devices_in_window, "devices", call_id),
    n_devices_before_metric_a: asCount(
      comparison.n_devices_a,
      "devices",
      call_id,
    ),
    n_devices_before_metric_b: asCount(
      comparison.n_devices_b,
      "devices",
      call_id,
    ),
    device_days_a: asCount(comparison.device_days_a, "device_days", call_id),
    device_days_b: asCount(comparison.device_days_b, "device_days", call_id),
    event_total_a: asCount(comparison.event_total_a, "sum", call_id),
    event_total_b: asCount(comparison.event_total_b, "sum", call_id),
    rate_a: asQuantity(comparison.rate_a, call_id),
    rate_b: asQuantity(comparison.rate_b, call_id),
    ratio:
      comparison.ratio === null ? null : asQuantity(comparison.ratio, call_id),
    ratio_ci_low:
      comparison.ratio_ci_low === null
        ? null
        : asCount(comparison.ratio_ci_low, "ratio", call_id),
    ratio_ci_high:
      comparison.ratio_ci_high === null
        ? null
        : asCount(comparison.ratio_ci_high, "ratio", call_id),
    ci_excludes_one: comparison.ci_excludes_one,
    method: comparison.method,
    empty_reason_a,
    empty_reason_b,
    empty: empty_reason_a !== null || empty_reason_b !== null,
  };
}
