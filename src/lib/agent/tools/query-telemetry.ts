import { breakdown, cohortSize, rateInWindow } from "../../analytics";
import type { TelemetryFilter } from "../../analytics/types";
import type { QueryTelemetryArgs } from "./args";
import { asCount, asQuantity } from "./quantity";
import type { ToolErr, ToolOk, ToolRuntime } from "./types";
import { emptyReason } from "./types";
import { resolveWindow } from "./windows";

export function runQueryTelemetry(
  args: QueryTelemetryArgs,
  runtime: ToolRuntime,
  call_id: string,
): ToolOk | ToolErr {
  const window_resolved = resolveWindow(args.window);
  const filter: TelemetryFilter = {
    window: { start: window_resolved.start, end: window_resolved.end },
    firmware_version: args.firmware_version,
    app_version: args.app_version,
    region: args.region,
    cohort: args.cohort,
  };

  const n_devices_in_window = cohortSize(runtime.telemetry, {
    window: filter.window,
  }).n_devices;
  const stats = rateInWindow(runtime.telemetry, args.metric, filter);
  const n_devices_before_metric = stats.n_devices;
  const reason = emptyReason(n_devices_before_metric, stats.event_total);

  const slices =
    args.breakdown === undefined
      ? null
      : breakdown(
          runtime.telemetry,
          args.metric,
          args.breakdown,
          filter,
        ).map((slice) => ({
          key: slice.key,
          n_devices: asCount(slice.n_devices, "devices", call_id),
          device_days: asCount(slice.device_days, "device_days", call_id),
          rate: asQuantity(slice.rate, call_id),
        }));

  return {
    ok: true,
    metric: args.metric,
    window_resolved,
    n_devices_in_window: asCount(n_devices_in_window, "devices", call_id),
    n_devices_before_metric: asCount(
      n_devices_before_metric,
      "devices",
      call_id,
    ),
    device_days: asCount(stats.device_days, "device_days", call_id),
    event_total: asCount(stats.event_total, "sum", call_id),
    rate: asQuantity(stats.rate, call_id),
    empty: reason !== null,
    empty_reason: reason,
    breakdown: slices,
  };
}
