import { compareRates, rateInWindow, trendDirection } from "../analytics";
import { isCountMetric } from "../analytics/rows";
import type { DateWindow, TrendDirection } from "../analytics/types";
import type { FirmwareVersion, SupportTag } from "../fixtures/constants";
import type {
  FeedbackRecord,
  TagTaxonomyEntry,
  TelemetryRecord,
} from "../fixtures/types";
import { firmwareCandidateId, TAG_TELEMETRY_METRIC, tagCandidateId } from "./ids";
import { triageQuantity } from "./quantity";
import { computeSeverity } from "./severity";
import type { SeverityInputs, TriageCandidate } from "./types";

const Z_95 = 1.959963984540054;

export type TriageInput = {
  telemetry: readonly TelemetryRecord[];
  feedback: readonly FeedbackRecord[];
  taxonomy: readonly TagTaxonomyEntry[];
  current: DateWindow;
  prior: DateWindow;
};

function inWindow(date: string, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function fleetSize(rows: readonly TelemetryRecord[]): number {
  return new Set(rows.map((row) => row.device_id)).size;
}

function ticketRates(
  currentEvents: number,
  currentDays: number,
  priorEvents: number,
  priorDays: number,
): {
  rate_window: number;
  rate_prior: number;
  trend: TrendDirection;
  ratio_ci_low: number | null;
  ratio_ci_high: number | null;
  ci_excludes_one: boolean;
} {
  const rate_window = currentDays === 0 ? 0 : currentEvents / currentDays;
  const rate_prior = priorDays === 0 ? 0 : priorEvents / priorDays;
  if (currentEvents <= 0 || priorEvents <= 0 || currentDays <= 0 || priorDays <= 0) {
    let trend: TrendDirection = "flat";
    if (rate_window > rate_prior) trend = "rising";
    else if (rate_window < rate_prior) trend = "falling";
    return {
      rate_window,
      rate_prior,
      trend,
      ratio_ci_low: null,
      ratio_ci_high: null,
      ci_excludes_one: false,
    };
  }
  const ratio = rate_window / rate_prior;
  const se = Math.sqrt(1 / currentEvents + 1 / priorEvents);
  const logRr = Math.log(ratio);
  const low = Math.exp(logRr - Z_95 * se);
  const high = Math.exp(logRr + Z_95 * se);
  let trend: TrendDirection = "flat";
  if (low > 1) trend = "rising";
  else if (high < 1) trend = "falling";
  return {
    rate_window,
    rate_prior,
    trend,
    ratio_ci_low: low,
    ratio_ci_high: high,
    ci_excludes_one: low > 1 || high < 1,
  };
}

function assemble(args: {
  id: string;
  kind: TriageCandidate["kind"];
  tag: SupportTag | null;
  firmware_version: string | null;
  device_ids: string[];
  rate_window: number;
  rate_prior: number;
  rate_unit: string;
  prior_events: number;
  ratio_ci_low: number | null;
  ratio_ci_high: number | null;
  ci_excludes_one: boolean;
  trend: TrendDirection;
  consequence_class: SeverityInputs["consequence_class"];
  fleet_size: number;
}): TriageCandidate {
  const inputs: SeverityInputs = {
    affected_users: args.device_ids.length,
    fleet_size: args.fleet_size,
    rate_window: args.rate_window,
    rate_prior: args.rate_prior,
    prior_events: args.prior_events,
    trend: args.trend,
    consequence_class: args.consequence_class,
  };
  const scored = computeSeverity(inputs);
  const ratio =
    args.rate_prior === 0 ? null : args.rate_window / args.rate_prior;
  return {
    id: args.id,
    kind: args.kind,
    tag: args.tag,
    firmware_version: args.firmware_version,
    consequence_class: args.consequence_class,
    device_ids: args.device_ids,
    affected_users: triageQuantity(args.device_ids.length, "users", args.id),
    rate_window: triageQuantity(args.rate_window, args.rate_unit, args.id),
    rate_prior: triageQuantity(args.rate_prior, args.rate_unit, args.id),
    delta_ratio: ratio === null ? null : triageQuantity(ratio, "ratio", args.id),
    prior_events: triageQuantity(args.prior_events, "events", args.id),
    ratio_ci_low: args.ratio_ci_low,
    ratio_ci_high: args.ratio_ci_high,
    ci_excludes_one: args.ci_excludes_one,
    trend: args.trend,
    severity_index: triageQuantity(scored.severity_index, "index", args.id),
    band: scored.band,
    delta_factor_floored: scored.delta_factor_floored,
    severity_inputs: inputs,
  };
}

function discoverTags(input: TriageInput, fleet_size: number): TriageCandidate[] {
  const { telemetry, feedback, taxonomy, current, prior } = input;
  const daysCurrent = telemetry.filter((row) => inWindow(row.date, current)).length;
  const daysPrior = telemetry.filter((row) => inWindow(row.date, prior)).length;
  const out: TriageCandidate[] = [];

  for (const entry of taxonomy) {
    const tag = entry.tag;
    const currentTickets = feedback.filter(
      (row) =>
        inWindow(row.timestamp.slice(0, 10), current) && row.tags.includes(tag),
    );
    if (currentTickets.length === 0) continue;
    const priorTickets = feedback.filter(
      (row) =>
        inWindow(row.timestamp.slice(0, 10), prior) && row.tags.includes(tag),
    );
    const device_ids = uniqueSorted(currentTickets.map((row) => row.device_id));
    const id = tagCandidateId(tag);
    const metric = TAG_TELEMETRY_METRIC[tag];

    if (metric) {
      const allowed = new Set(device_ids);
      const subset = telemetry.filter((row) => allowed.has(row.device_id));
      const windowRate = rateInWindow(subset, metric, { window: current });
      const priorRate = rateInWindow(subset, metric, { window: prior });
      const comparison = compareRates(
        subset,
        metric,
        { window: current },
        { window: prior },
      );
      let trend = trendDirection(subset, metric, prior, current);
      if (comparison.ratio === null && windowRate.rate.value > priorRate.rate.value) {
        trend = "rising";
      }
      out.push(
        assemble({
          id,
          kind: "tag",
          tag,
          firmware_version: null,
          device_ids,
          rate_window: windowRate.rate.value,
          rate_prior: priorRate.rate.value,
          rate_unit: windowRate.rate.unit,
          prior_events: isCountMetric(metric)
            ? priorRate.event_total
            : priorRate.device_days,
          ratio_ci_low: comparison.ratio_ci_low,
          ratio_ci_high: comparison.ratio_ci_high,
          ci_excludes_one: comparison.ci_excludes_one,
          trend,
          consequence_class: entry.consequence_class,
          fleet_size,
        }),
      );
      continue;
    }

    const tickets = ticketRates(
      currentTickets.length,
      daysCurrent,
      priorTickets.length,
      daysPrior,
    );
    out.push(
      assemble({
        id,
        kind: "tag",
        tag,
        firmware_version: null,
        device_ids,
        rate_window: tickets.rate_window,
        rate_prior: tickets.rate_prior,
        rate_unit: "tickets_per_device_day",
        prior_events: priorTickets.length,
        ratio_ci_low: tickets.ratio_ci_low,
        ratio_ci_high: tickets.ratio_ci_high,
        ci_excludes_one: tickets.ci_excludes_one,
        trend: tickets.trend,
        consequence_class: entry.consequence_class,
        fleet_size,
      }),
    );
  }
  return out;
}

function discoverFirmware(
  input: TriageInput,
  fleet_size: number,
): TriageCandidate[] {
  const { telemetry, current, prior } = input;
  const metric = "ble_disconnects_24h" as const;
  const versions = uniqueSorted(
    telemetry
      .filter((row) => inWindow(row.date, current))
      .map((row) => row.firmware_version),
  ) as FirmwareVersion[];
  const out: TriageCandidate[] = [];

  for (const version of versions) {
    const currentSlice = rateInWindow(telemetry, metric, {
      window: current,
      firmware_version: version,
    });
    const selfPrior = rateInWindow(telemetry, metric, {
      window: prior,
      firmware_version: version,
    });
    const isNew = selfPrior.device_days === 0;
    const vsSelf = compareRates(
      telemetry,
      metric,
      { window: current, firmware_version: version },
      { window: prior, firmware_version: version },
    );
    if (!isNew && !vsSelf.ci_excludes_one) continue;

    const priorRate = isNew
      ? rateInWindow(telemetry, metric, { window: prior })
      : selfPrior;
    const vsPrior = isNew
      ? compareRates(
          telemetry,
          metric,
          { window: current, firmware_version: version },
          { window: prior },
        )
      : vsSelf;

    let trend: TrendDirection = "flat";
    if (vsPrior.ci_excludes_one && vsPrior.ratio) {
      trend = vsPrior.ratio.value > 1 ? "rising" : "falling";
    } else if (isNew && currentSlice.rate.value > priorRate.rate.value) {
      trend = "rising";
    }

    const device_ids = uniqueSorted(
      telemetry
        .filter(
          (row) =>
            inWindow(row.date, current) && row.firmware_version === version,
        )
        .map((row) => row.device_id),
    );

    out.push(
      assemble({
        id: firmwareCandidateId(version),
        kind: "firmware",
        tag: null,
        firmware_version: version,
        device_ids,
        rate_window: currentSlice.rate.value,
        rate_prior: priorRate.rate.value,
        rate_unit: currentSlice.rate.unit,
        prior_events: priorRate.event_total,
        ratio_ci_low: vsPrior.ratio_ci_low,
        ratio_ci_high: vsPrior.ratio_ci_high,
        ci_excludes_one: vsPrior.ci_excludes_one,
        trend,
        consequence_class: "FUNCTIONAL",
        fleet_size,
      }),
    );
  }
  return out;
}

export function runTriage(input: TriageInput): TriageCandidate[] {
  const fleet_size = fleetSize(input.telemetry);
  return [...discoverTags(input, fleet_size), ...discoverFirmware(input, fleet_size)].sort(
    (a, b) => b.severity_index.value - a.severity_index.value,
  );
}
