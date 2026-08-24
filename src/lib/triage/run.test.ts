import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../fixtures/constants";
import type {
  FeedbackRecord,
  TagTaxonomyEntry,
  TelemetryRecord,
} from "../fixtures/types";
import { firmwareCandidateId } from "./ids";
import { runTriage } from "./run";

const root = path.resolve(__dirname, "../../..");

function loadJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(path.join(root, "synthetic-data", name), "utf8"),
  ) as T;
}

const telemetry = loadJson<TelemetryRecord[]>("telemetry.json");
const feedback = loadJson<FeedbackRecord[]>("feedback.json");
const taxonomy = loadJson<TagTaxonomyEntry[]>("tag-taxonomy.json");

const current = { start: CURRENT_WINDOW_START, end: CURRENT_WINDOW_END };
const prior = { start: PRIOR_WINDOW_START, end: PRIOR_WINDOW_END };

describe("runTriage", () => {
  const candidates = runTriage({
    telemetry,
    feedback,
    taxonomy,
    current,
    prior,
  });

  it("emits one candidate per current-window tag plus noteworthy firmware slices, uncapped", () => {
    const tags = candidates.filter((c) => c.kind === "tag");
    const firmware = candidates.filter((c) => c.kind === "firmware");
    expect(tags).toHaveLength(12);
    expect(firmware.map((c) => c.firmware_version)).toEqual(["1.4.2"]);
    expect(candidates).toHaveLength(13);
    expect(candidates.every((c) => !c.id.includes("SIG"))).toBe(true);
  });

  it("ranks the 1.4.2 firmware BLE slice HIGH", () => {
    const fw = candidates.find((c) => c.id === firmwareCandidateId("1.4.2"));
    expect(fw).toBeDefined();
    expect(fw!.band).toBe("HIGH");
    expect(fw!.affected_users.value).toBe(100);
    expect(fw!.trend).toBe("rising");
    expect(fw!.severity_index.source).toEqual({
      kind: "triage",
      signal_id: fw!.id,
    });
  });

  it("does not give every candidate HIGH", () => {
    const bands = new Set(candidates.map((c) => c.band));
    expect(bands.has("HIGH")).toBe(true);
    expect(bands.size).toBeGreaterThan(1);
  });
});
