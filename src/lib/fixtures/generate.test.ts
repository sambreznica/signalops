import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  DEVICE_COUNT,
  FEEDBACK_COUNT,
  FIXTURE_SEED,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
  RESOLVER_CELL_MIN,
  SIG_003_TICKET_COUNT,
  SYNTHETIC_TODAY,
  TAG_TAXONOMY,
  TELEMETRY_COUNT,
} from "./constants";
import { generateFixtures, serializeFixtureJson } from "./generate";
import { GROUND_TRUTH_KEYS, strip } from "./strip";
import type { FeedbackRecord, TelemetryRecord } from "./types";

const root = path.resolve(__dirname, "../../..");

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function hasGroundTruthKey(record: Record<string, unknown>): boolean {
  return GROUND_TRUTH_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(record, key),
  );
}

describe("fixture generator", () => {
  const bundle = generateFixtures(FIXTURE_SEED);

  it("is deterministic for a fixed seed", () => {
    const again = generateFixtures(FIXTURE_SEED);
    expect(serializeFixtureJson(again)).toBe(serializeFixtureJson(bundle));
  });

  it("emits the specified volumes and panel shape", () => {
    expect(bundle.devices).toHaveLength(DEVICE_COUNT);
    expect(bundle.telemetry).toHaveLength(TELEMETRY_COUNT);
    expect(bundle.feedback).toHaveLength(FEEDBACK_COUNT);
    expect(bundle.taxonomy).toHaveLength(12);

    const datesByDevice = new Map<string, string[]>();
    for (const row of bundle.telemetry) {
      const dates = datesByDevice.get(row.device_id) ?? [];
      dates.push(row.date);
      datesByDevice.set(row.device_id, dates);
    }
    expect(datesByDevice.size).toBe(DEVICE_COUNT);
    for (const dates of datesByDevice.values()) {
      expect(dates).toHaveLength(6);
      expect(dates.some((d) => d >= PRIOR_WINDOW_START && d <= PRIOR_WINDOW_END)).toBe(
        true,
      );
      expect(
        dates.some((d) => d >= CURRENT_WINDOW_START && d <= CURRENT_WINDOW_END),
      ).toBe(true);
      expect(dates.includes(SYNTHETIC_TODAY)).toBe(false);
    }
  });

  it("keeps ground-truth keys off agent-readable records", () => {
    const records: Record<string, unknown>[] = [
      ...bundle.devices,
      ...bundle.telemetry,
      ...bundle.feedback,
    ];
    for (const record of records) {
      expect(hasGroundTruthKey(record)).toBe(false);
      const stripped = strip(record);
      for (const key of GROUND_TRUTH_KEYS) {
        expect(stripped).not.toHaveProperty(key);
      }
    }
  });

  it("has a resolver cell of at least 30 devices on 1.4.1 with app 3.2", () => {
    const resolver = new Set(
      bundle.telemetry
        .filter(
          (row) =>
            row.firmware_version === "1.4.1" && row.app_version === "3.2",
        )
        .map((row) => row.device_id),
    );
    expect(resolver.size).toBeGreaterThanOrEqual(RESOLVER_CELL_MIN);
  });

  it("ships app 3.2 in the same window as firmware 1.4.2, with resolver BLE at baseline", () => {
    const current = bundle.telemetry.filter(
      (row) => row.date >= CURRENT_WINDOW_START && row.date <= CURRENT_WINDOW_END,
    );
    const fw142 = current.filter((row) => row.firmware_version === "1.4.2");
    const app32 = current.filter((row) => row.app_version === "3.2");
    expect(fw142.length).toBeGreaterThan(0);
    expect(app32.length).toBeGreaterThan(0);
    expect(fw142.every((row) => row.app_version === "3.2")).toBe(true);

    const resolverBle = mean(
      current
        .filter(
          (row) =>
            row.firmware_version === "1.4.1" && row.app_version === "3.2",
        )
        .map((row) => row.ble_disconnects_24h),
    );
    const fw142Ble = mean(fw142.map((row) => row.ble_disconnects_24h));
    const olderBle = mean(
      current
        .filter((row) => row.firmware_version !== "1.4.2")
        .map((row) => row.ble_disconnects_24h),
    );
    expect(fw142Ble).toBeGreaterThan(olderBle * 2);
    expect(Math.abs(resolverBle - olderBle)).toBeLessThan(1);
  });

  it("keeps SIG-004 nordics battery drain similar across windows", () => {
    const nordics = bundle.telemetry.filter((row) => row.region === "nordics");
    const prior = mean(
      nordics
        .filter((row) => row.date >= PRIOR_WINDOW_START && row.date <= PRIOR_WINDOW_END)
        .map((row) => row.battery_drain_pct),
    );
    const current = mean(
      nordics
        .filter(
          (row) =>
            row.date >= CURRENT_WINDOW_START && row.date <= CURRENT_WINDOW_END,
        )
        .map((row) => row.battery_drain_pct),
    );
    expect(Math.abs(current - prior)).toBeLessThan(1.5);
  });

  it("places unrelated session-gap drift in a non-nordics region", () => {
    const currentIberia = mean(
      bundle.telemetry
        .filter(
          (row) =>
            row.region === "iberia" &&
            row.date >= CURRENT_WINDOW_START &&
            row.date <= CURRENT_WINDOW_END,
        )
        .map((row) => row.session_gap_minutes),
    );
    const currentUk = mean(
      bundle.telemetry
        .filter(
          (row) =>
            row.region === "uk" &&
            row.date >= CURRENT_WINDOW_START &&
            row.date <= CURRENT_WINDOW_END,
        )
        .map((row) => row.session_gap_minutes),
    );
    expect(currentIberia).toBeGreaterThan(currentUk + 30);
  });

  it("puts every cluster tag on at least one record outside that cluster", () => {
    const byId = new Map(bundle.signals.signals.map((s) => [s.id, s]));
    const home: Record<string, string> = {
      connectivity: "SIG-001",
      "app-sync": "SIG-001",
      adhesion: "SIG-002",
      "skin-irritation": "SIG-002",
      "comfort-fit": "SIG-002",
      "claims-interpretation": "SIG-003",
      "data-accuracy": "SIG-003",
      battery: "SIG-004",
      overheating: "SIG-004",
      "app-ui": "SIG-004",
    };

    for (const entry of TAG_TAXONOMY) {
      const tagged = bundle.feedback.filter((row) => row.tags.includes(entry.tag));
      expect(tagged.length).toBeGreaterThan(0);
      const clusterId = home[entry.tag];
      if (!clusterId) continue;
      const clusterIds = new Set(byId.get(clusterId as "SIG-001")?.feedback_ids);
      const outside = tagged.filter((row) => !clusterIds.has(row.id));
      expect(outside.length, `${entry.tag} must appear outside its cluster`).toBeGreaterThan(
        0,
      );
    }
  });

  it("defines sidecar membership as current-window observable devices, not host populations", () => {
    const byId = new Map(bundle.signals.signals.map((s) => [s.id, s]));
    const nordics = new Set(
      bundle.telemetry
        .filter((row) => row.region === "nordics")
        .map((row) => row.device_id),
    );
    const fw142 = new Set(
      bundle.telemetry
        .filter((row) => row.firmware_version === "1.4.2")
        .map((row) => row.device_id),
    );
    expect(byId.get("SIG-001")?.device_ids).toEqual([...fw142].sort());
    expect(byId.get("SIG-004")!.device_ids.length).toBeLessThan(nordics.size);

    for (const signal of bundle.signals.signals) {
      if (signal.id === "SIG-001") continue;
      const tickets = bundle.feedback.filter((row) =>
        signal.feedback_ids.includes(row.id),
      );
      const currentDevices = [
        ...new Set(
          tickets
            .filter(
              (row) =>
                row.timestamp.slice(0, 10) >= CURRENT_WINDOW_START &&
                row.timestamp.slice(0, 10) <= CURRENT_WINDOW_END,
            )
            .map((row) => row.device_id),
        ),
      ].sort();
      expect(signal.device_ids).toEqual(currentDevices);
    }
  });

  it("records SIG-003 as claims risk with high-teens tickets and null severity", () => {
    const sig003 = bundle.signals.signals.find((s) => s.id === "SIG-003");
    expect(sig003).toBeDefined();
    expect(sig003?.is_real).toBe(true);
    expect(sig003?.authorial_severity).toBeNull();
    expect(sig003?.claims_risk).toBe(true);
    expect(sig003?.feedback_ids).toHaveLength(SIG_003_TICKET_COUNT);
    expect(sig003?.device_ids.length).toBeLessThan(25);
  });

  it("matches the committed synthetic-data artefacts", () => {
    const files: Array<[string, unknown]> = [
      ["devices.json", bundle.devices],
      ["telemetry.json", bundle.telemetry],
      ["feedback.json", bundle.feedback],
      ["tag-taxonomy.json", bundle.taxonomy],
      ["signals.json", bundle.signals],
    ];
    for (const [name, value] of files) {
      const onDisk = readFileSync(path.join(root, "synthetic-data", name), "utf8");
      expect(onDisk).toBe(serializeFixtureJson(value));
    }
  });
});

describe("fixture records", () => {
  it("types check against agent-visible fields only", () => {
    const bundle = generateFixtures();
    const sampleFb: FeedbackRecord = bundle.feedback[0]!;
    const sampleTel: TelemetryRecord = bundle.telemetry[0]!;
    expect(sampleFb.id.startsWith("FB-")).toBe(true);
    expect(sampleTel.motion_intensity).toBeGreaterThanOrEqual(0);
    expect(sampleTel.motion_intensity).toBeLessThanOrEqual(100);
  });
});
