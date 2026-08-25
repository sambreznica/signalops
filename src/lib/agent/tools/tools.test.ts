import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareRates, rateInWindow } from "../../analytics";
import type { FeedbackRecord, TelemetryRecord } from "../../fixtures/types";
import { quantitySchema, traceEventSchema } from "../../schema";
import type { Quantity } from "../../schema";
import { invoke } from "./invoke";
import { loadStaticRuntime } from "./runtime";
import { FEEDBACK_SAMPLE_CAP, FEEDBACK_TEXT_CHARS, KNOWLEDGE_K_MAX } from "./caps";
import { groupClosedIncidents } from "./find-similar-incidents";
import type { InvokeContext, ToolRuntime } from "./types";
import { evenlySpaced } from "./sample";

const ROOT = path.resolve(__dirname, "../../../..");
const CTX: InvokeContext = { call_id: "tc_test_1", actor: "investigator" };

function qty(value: unknown): Quantity {
  return quantitySchema.parse(value);
}

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

describe("invoke", () => {
  const runtime = loadStaticRuntime(ROOT, async () => {
    throw new Error("embedQuery should be injected per test");
  });

  it("returns ok:false and a trace event when window is omitted", async () => {
    const outcome = await invoke(
      "query_telemetry",
      { metric: "ble_disconnects_24h" },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(false);
    if (outcome.result.ok) return;
    expect(outcome.result.error).toMatch(/window/i);
    expect(traceEventSchema.parse(outcome.event).call_id).toBe("tc_test_1");
    expect(outcome.event.tool).toBe("query_telemetry");
    expect(outcome.event.tokens).toBe(0);
  });

  it("stamps quantities with the dispatcher call_id", async () => {
    const outcome = await invoke(
      "query_telemetry",
      { metric: "ble_disconnects_24h", window: "current", firmware_version: "1.4.2" },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    const rate = qty(outcome.result.rate);
    expect(rate.source).toEqual({ kind: "tool_call", call_id: "tc_test_1" });
    expect(outcome.event.call_id).toBe("tc_test_1");
  });
});

describe("query_telemetry", () => {
  const runtime = loadStaticRuntime(ROOT, async () => [0]);

  it("matches analytics on the 1.4.2 current-window disconnect rate", async () => {
    const outcome = await invoke(
      "query_telemetry",
      {
        metric: "ble_disconnects_24h",
        window: "current",
        firmware_version: "1.4.2",
      },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    const expected = rateInWindow(runtime.telemetry, "ble_disconnects_24h", {
      window: { start: "2026-05-04", end: "2026-05-17" },
      firmware_version: "1.4.2",
    });
    expect(qty(outcome.result.rate).value).toBe(expected.rate.value);
    expect(qty(outcome.result.n_devices_before_metric).value).toBe(
      expected.n_devices,
    );
    expect(outcome.result.empty_reason).toBeNull();
    expect(outcome.result.empty).toBe(false);
    expect(outcome.result).not.toHaveProperty("rows");
  });

  it("distinguishes no events from a filter that matched no devices", async () => {
    const local: ToolRuntime = {
      ...runtime,
      telemetry: [
        row({ device_id: "KL-A", adhesion_flag: false, firmware_version: "1.4.1" }),
        row({ device_id: "KL-B", adhesion_flag: false, firmware_version: "1.4.1" }),
      ],
    };

    const none = await invoke(
      "query_telemetry",
      { metric: "adhesion_flag", window: "current" },
      CTX,
      local,
    );
    expect(none.result.ok).toBe(true);
    if (!none.result.ok) return;
    expect(qty(none.result.n_devices_in_window).value).toBe(2);
    expect(qty(none.result.n_devices_before_metric).value).toBe(2);
    expect(qty(none.result.event_total).value).toBe(0);
    expect(none.result.empty).toBe(true);
    expect(none.result.empty_reason).toBe("no_events");

    const missed = await invoke(
      "query_telemetry",
      {
        metric: "adhesion_flag",
        window: "current",
        firmware_version: "1.4.2",
      },
      CTX,
      local,
    );
    expect(missed.result.ok).toBe(true);
    if (!missed.result.ok) return;
    expect(qty(missed.result.n_devices_in_window).value).toBe(2);
    expect(qty(missed.result.n_devices_before_metric).value).toBe(0);
    expect(missed.result.empty).toBe(true);
    expect(missed.result.empty_reason).toBe("filter_matched_no_devices");
  });

  it("treats 1.4.2 in the prior window as a filter that matched nothing", async () => {
    const outcome = await invoke(
      "query_telemetry",
      {
        metric: "ble_disconnects_24h",
        window: "prior",
        firmware_version: "1.4.2",
      },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    expect(qty(outcome.result.n_devices_in_window).value).toBeGreaterThan(0);
    expect(qty(outcome.result.n_devices_before_metric).value).toBe(0);
    expect(outcome.result.empty_reason).toBe("filter_matched_no_devices");
  });
});

describe("compare_versions", () => {
  const runtime = loadStaticRuntime(ROOT, async () => [0]);

  it("returns ci_excludes_one and never a field named significant", async () => {
    const outcome = await invoke(
      "compare_versions",
      {
        metric: "ble_disconnects_24h",
        window: "current",
        axis: "firmware_version",
        version_a: "1.4.2",
        version_b: "1.4.1",
        hold: { app_version: "3.2" },
      },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    expect(outcome.result).not.toHaveProperty("significant");
    const expected = compareRates(
      runtime.telemetry,
      "ble_disconnects_24h",
      {
        window: { start: "2026-05-04", end: "2026-05-17" },
        firmware_version: "1.4.2",
        app_version: "3.2",
      },
      {
        window: { start: "2026-05-04", end: "2026-05-17" },
        firmware_version: "1.4.1",
        app_version: "3.2",
      },
    );
    expect(outcome.result.ci_excludes_one).toBe(expected.ci_excludes_one);
    expect(expected.ci_excludes_one).toBe(true);
    expect(qty(outcome.result.ratio).value).toBe(expected.ratio!.value);
    expect(qty(outcome.result.n_devices_before_metric_b).value).toBeGreaterThanOrEqual(
      30,
    );
  });
});

describe("search_feedback", () => {
  const runtime = loadStaticRuntime(ROOT, async () => [0]);

  it("returns sample_size of sampled_from, not a prefix of the match set", async () => {
    const outcome = await invoke(
      "search_feedback",
      { query: "the", window: "current" },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    const n_matched = qty(outcome.result.n_matched).value;
    const sample_size = qty(outcome.result.sample_size).value;
    const sampled_from = qty(outcome.result.sampled_from).value;
    expect(sampled_from).toBe(n_matched);
    expect(n_matched).toBeGreaterThan(FEEDBACK_SAMPLE_CAP);
    expect(sample_size).toBe(FEEDBACK_SAMPLE_CAP);
    expect(outcome.result.selection).toBe("evenly_spaced_by_timestamp");

    const sample = outcome.result.sample as { timestamp: string; id: string; text: string }[];
    expect(sample).toHaveLength(FEEDBACK_SAMPLE_CAP);
    for (let i = 1; i < sample.length; i++) {
      expect(sample[i]!.timestamp >= sample[i - 1]!.timestamp).toBe(true);
    }
    expect(sample.every((row) => row.text.length <= FEEDBACK_TEXT_CHARS)).toBe(
      true,
    );

    const window = { start: "2026-05-04", end: "2026-05-17" };
    const matches = (runtime.feedback as FeedbackRecord[])
      .filter((row) => {
        const day = row.timestamp.slice(0, 10);
        if (day < window.start || day > window.end) return false;
        return `${row.text} ${row.tags.join(" ")}`.toLowerCase().includes("the");
      })
      .sort((a, b) =>
        a.timestamp === b.timestamp
          ? a.id.localeCompare(b.id)
          : a.timestamp.localeCompare(b.timestamp),
      );
    const expected = evenlySpaced(matches, FEEDBACK_SAMPLE_CAP);
    expect(sample.map((row) => row.id)).toEqual(expected.map((row) => row.id));
    expect(sample[0]!.id).toBe(matches[0]!.id);
    expect(sample[sample.length - 1]!.id).toBe(matches[matches.length - 1]!.id);
  });
});

describe("search_knowledge", () => {
  it("ranks a query vector that is a stored chunk as that chunk first", async () => {
    const base = loadStaticRuntime(ROOT, async () => [0]);
    const target = base.embeddings.chunks.find(
      (chunk) => chunk.doc_id === "KD-02" && chunk.section.includes("1.4.2"),
    );
    expect(target).toBeDefined();
    const runtime: ToolRuntime = {
      ...base,
      embedQuery: async () => target!.embedding,
    };
    const outcome = await invoke(
      "search_knowledge",
      { query: "placeholder", doc_id: "KD-02", k: 3 },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    const chunks = outcome.result.chunks as { chunk_id: string; score: number }[];
    expect(chunks[0]!.chunk_id).toBe(target!.chunk_id);
    expect(chunks[0]!.score).toBeCloseTo(1, 5);
    expect(qty(outcome.result.k_resolved).value).toBe(3);
  });

  it("clamps k to 8", async () => {
    const base = loadStaticRuntime(ROOT, async () => [0]);
    const runtime: ToolRuntime = {
      ...base,
      embedQuery: async () => base.embeddings.chunks[0]!.embedding,
    };
    const outcome = await invoke(
      "search_knowledge",
      { query: "placeholder", k: 99 },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    expect(qty(outcome.result.k_resolved).value).toBe(KNOWLEDGE_K_MAX);
    expect(qty(outcome.result.returned).value).toBe(KNOWLEDGE_K_MAX);
  });
});

describe("find_similar_incidents", () => {
  it("returns corpus_size 4 so a top-3 cap is visible as truncation", async () => {
    const base = loadStaticRuntime(ROOT, async () => [0]);
    const grouped = groupClosedIncidents(base.embeddings.chunks);
    expect(grouped).toHaveLength(4);

    const target = grouped[0]!.chunks[0]!;
    const runtime: ToolRuntime = {
      ...base,
      embedQuery: async () => target.embedding,
    };
    const outcome = await invoke(
      "find_similar_incidents",
      { description: "placeholder" },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    expect(qty(outcome.result.corpus_size).value).toBe(4);
    expect(qty(outcome.result.returned).value).toBe(3);
    expect(outcome.result.truncated).toBe(true);
    expect(outcome.result.selection).toBe("top_k_by_max_chunk_cosine");
    const incidents = outcome.result.incidents as {
      incident_id: string;
      chunk_id: string;
    }[];
    expect(incidents).toHaveLength(3);
    expect(incidents[0]!.incident_id).toBe(grouped[0]!.incident_id);
  });
});
