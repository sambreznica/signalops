import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FeedbackRecord, TagTaxonomyEntry, TelemetryRecord } from "../fixtures/types";
import {
  breakdown,
  cohortSize,
  compareRates,
  correlate,
  feedbackByTag,
  rateInWindow,
  temporalDistribution,
  trendDirection,
} from "./index";

const root = path.resolve(__dirname, "../../..");

function loadJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(path.join(root, "synthetic-data", name), "utf8"),
  ) as T;
}

const telemetry = loadJson<TelemetryRecord[]>("telemetry.json");
const feedback = loadJson<FeedbackRecord[]>("feedback.json");
const taxonomy = loadJson<TagTaxonomyEntry[]>("tag-taxonomy.json");

const CURRENT = { start: "2026-05-04", end: "2026-05-17" };
const PRIOR = { start: "2026-04-20", end: "2026-05-03" };

function row(overrides: Partial<TelemetryRecord>): TelemetryRecord {
  return {
    device_id: "KL-0001",
    date: "2026-05-10",
    firmware_version: "1.4.1",
    app_version: "3.2",
    region: "uk",
    cohort: "beta_wave_1",
    ble_disconnects_24h: 1,
    session_gap_minutes: 30,
    adhesion_flag: false,
    activity_level: "moderate",
    motion_intensity: 40,
    skin_temp_delta_c: 0.5,
    battery_drain_pct: 12,
    ...overrides,
  };
}

describe("rateInWindow", () => {
  it("uses device-days as the denominator", () => {
    const current142 = telemetry.filter(
      (r) =>
        r.firmware_version === "1.4.2" &&
        r.date >= CURRENT.start &&
        r.date <= CURRENT.end,
    );
    const sum = current142.reduce((s, r) => s + r.ble_disconnects_24h, 0);
    const got = rateInWindow(telemetry, "ble_disconnects_24h", {
      window: CURRENT,
      firmware_version: "1.4.2",
    });
    expect(got.device_days).toBe(current142.length);
    expect(got.n_devices).toBe(new Set(current142.map((r) => r.device_id)).size);
    expect(got.rate.value).toBe(sum / current142.length);
    expect(got.rate.unit).toBe("disconnects_per_device_day");
    expect(got.event_total).toBe(sum);
  });
});

describe("compareRates", () => {
  it("finds a higher disconnect rate on 1.4.2 than on 1.4.1 with app 3.2, CI excluding 1", () => {
    const comparison = compareRates(
      telemetry,
      "ble_disconnects_24h",
      { window: CURRENT, firmware_version: "1.4.2" },
      { window: CURRENT, firmware_version: "1.4.1", app_version: "3.2" },
    );
    expect(comparison.method).toBe("poisson_wald_log_rate_ratio_unclustered");
    expect(comparison.n_devices_b).toBeGreaterThanOrEqual(30);
    expect(comparison.device_days_a).toBeGreaterThan(comparison.n_devices_a);
    expect(comparison.ratio).not.toBeNull();
    expect(comparison.ratio!.value).toBeGreaterThan(2);
    expect(comparison.ci_excludes_one).toBe(true);
    expect(comparison.ratio_ci_low).toBeGreaterThan(1);
  });

  it("does not claim a battery step in nordics across windows", () => {
    const comparison = compareRates(
      telemetry,
      "battery_drain_pct",
      { window: CURRENT, region: "nordics" },
      { window: PRIOR, region: "nordics" },
    );
    expect(comparison.method).toBe("mean_ratio_unintervalled");
    expect(comparison.ratio).not.toBeNull();
    expect(comparison.ratio!.value).toBeGreaterThan(0.9);
    expect(comparison.ratio!.value).toBeLessThan(1.1);
    expect(comparison.ratio_ci_low).toBeNull();
    expect(comparison.ci_excludes_one).toBe(false);
  });

  it("returns a null ratio when either count is zero", () => {
    const rows = [
      row({
        device_id: "KL-A",
        firmware_version: "1.4.2",
        ble_disconnects_24h: 0,
      }),
      row({
        device_id: "KL-B",
        firmware_version: "1.4.1",
        ble_disconnects_24h: 4,
      }),
    ];
    const comparison = compareRates(
      rows,
      "ble_disconnects_24h",
      { firmware_version: "1.4.2" },
      { firmware_version: "1.4.1" },
    );
    expect(comparison.ratio).toBeNull();
    expect(comparison.ratio_ci_low).toBeNull();
    expect(comparison.ratio_ci_high).toBeNull();
    expect(comparison.ci_excludes_one).toBe(false);
  });
});

describe("cohorts and temporal", () => {
  it("sizes the 1.4.1 + 3.2 cell in the current window", () => {
    const size = cohortSize(telemetry, {
      window: CURRENT,
      firmware_version: "1.4.1",
      app_version: "3.2",
    });
    expect(size.n_devices).toBeGreaterThanOrEqual(30);
    expect(size.device_days).toBe(size.n_devices * 3);
  });

  it("breaks down current-window disconnects by firmware", () => {
    const slices = breakdown(telemetry, "ble_disconnects_24h", "firmware_version", {
      window: CURRENT,
    });
    const fw142 = slices.find((s) => s.key === "1.4.2");
    const fw141 = slices.find((s) => s.key === "1.4.1");
    expect(fw142).toBeDefined();
    expect(fw141).toBeDefined();
    expect(fw142!.rate.value).toBeGreaterThan(fw141!.rate.value);
    expect(fw142!.rate.unit).toBe("disconnects_per_device_day");
  });

  it("emits one point per date in a window", () => {
    const points = temporalDistribution(telemetry, "ble_disconnects_24h", {
      window: CURRENT,
    });
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => p.date >= CURRENT.start && p.date <= CURRENT.end)).toBe(
      true,
    );
  });

  it("calls current-window disconnects rising versus prior", () => {
    expect(
      trendDirection(telemetry, "ble_disconnects_24h", PRIOR, CURRENT),
    ).toBe("rising");
  });

  it("sees elevated session gaps in iberia in the current window", () => {
    const iberia = rateInWindow(telemetry, "session_gap_minutes", {
      window: CURRENT,
      region: "iberia",
    });
    const uk = rateInWindow(telemetry, "session_gap_minutes", {
      window: CURRENT,
      region: "uk",
    });
    expect(iberia.rate.value).toBeGreaterThan(uk.rate.value + 30);
    expect(iberia.rate.unit).toBe("minutes_per_device_day");
  });
});

describe("correlate", () => {
  it("uses point-biserial for adhesion_flag vs motion_intensity and reports both ns", () => {
    const result = correlate(telemetry, "adhesion_flag", "motion_intensity");
    expect(result.method).toBe("point_biserial");
    expect(result.coefficient).toBeGreaterThan(0.2);
    expect(result.n_pairs).toBe(2400);
    expect(result.n_devices).toBe(400);
    expect(result).not.toHaveProperty("p_value");
    expect(result).not.toHaveProperty("effect");
  });

  it("uses point-biserial for adhesion_flag vs skin_temp_delta_c", () => {
    const result = correlate(telemetry, "adhesion_flag", "skin_temp_delta_c");
    expect(result.method).toBe("point_biserial");
    expect(result.coefficient).toBeGreaterThan(0.15);
    expect(result.n_devices).toBe(400);
  });

  it("uses Spearman for adhesion_flag vs ordinal activity_level", () => {
    const result = correlate(telemetry, "adhesion_flag", "activity_level");
    expect(result.method).toBe("spearman");
    expect(result.coefficient).toBeGreaterThan(0.15);
    expect(result.n_pairs).toBeGreaterThan(result.n_devices);
  });
});

describe("feedbackByTag", () => {
  it("returns consequence_class and never weight", () => {
    const stats = feedbackByTag(feedback, taxonomy);
    expect(stats).toHaveLength(12);
    const connectivity = stats.find((s) => s.tag === "connectivity");
    expect(connectivity?.consequence_class).toBe("FUNCTIONAL");
    expect(connectivity?.n_tickets).toBeGreaterThan(0);
    for (const row of stats) {
      expect(row).not.toHaveProperty("weight");
      expect(row.consequence_class).toBeDefined();
    }
    const claims = stats.find((s) => s.tag === "claims-interpretation");
    expect(claims?.consequence_class).toBe("REGULATORY");
  });
});
