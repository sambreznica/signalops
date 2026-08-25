import { describe, expect, it } from "vitest";
import type { TriageCandidate } from "../src/lib/triage/types";
import { eval02 } from "./assertions";
import { firmwareIdentified } from "./firmware-id";
import type { HarnessContext } from "./load";
import { makeInvestigation } from "./make-output";
import type { InvestigationOutput } from "../src/lib/schema/investigation";

function ctxFor(output: InvestigationOutput): HarnessContext {
  return {
    sidecar: [],
    candidates: [{ id: "cnd_fw_1_4_2" } as TriageCandidate],
    matches: [
      {
        reference_id: "SIG-001",
        matched: true,
        match_set: [],
        union_coverage: 1,
        primary: {
          candidate_id: "cnd_fw_1_4_2",
          precision: 1,
          coverage: 1,
          jaccard: 1,
        },
      },
    ],
    embeddings: { model: "test", dims: 0, chunks: [] },
    run: {
      run_id: "eval02-fixture",
      timestamp: "2026-05-18T00:00:00Z",
      model: "test",
      effort: "medium",
      n: 1,
      kind: "agent",
      investigations: [
        {
          candidate_id: "cnd_fw_1_4_2",
          output,
          pre_critic: null,
          metrics: {
            tool_calls: 1,
            tokens: 0,
            wall_clock_ms: 1,
            cache_hits: 0,
            cache_misses: 1,
          },
        },
      ],
      approvals: [],
      execution_log: [],
    },
    runError: null,
  };
}

const pinnedAndNamed = makeInvestigation({
  leading_hypothesis: {
    statement: "Firmware 1.4.2 is associated with a higher disconnect rate relative to 1.4.1.",
    evidence_type: "correlational",
  },
  deterministic_findings: [
    {
      id: "f_1",
      label: "ble_disconnects_24h rate, firmware 1.4.1 vs 1.4.2",
      value: 6.8,
      unit: "ratio",
      source: { kind: "tool_call", call_id: "call-1" },
    },
  ],
  trace: [
    {
      kind: "tool_call",
      call_id: "call-1",
      actor: "investigator",
      tool: "compare_versions",
      arguments: {
        metric: "ble_disconnects_24h",
        window: "current",
        axis: "firmware_version",
        version_a: "1.4.1",
        version_b: "1.4.2",
      },
      result_summary: "interval_excludes_one",
      latency_ms: 1,
      tokens: 0,
    },
  ],
});

const recentFirmwareProse = makeInvestigation({
  leading_hypothesis: {
    statement: "Recent firmware coincides with a higher disconnect rate.",
    evidence_type: "correlational",
  },
  deterministic_findings: [
    {
      id: "f_1",
      label: "disconnect rate in the current window",
      value: 10.5,
      unit: "disconnects_per_device_day",
      source: { kind: "tool_call", call_id: "call-1" },
    },
  ],
  trace: [
    {
      kind: "tool_call",
      call_id: "call-1",
      actor: "investigator",
      tool: "query_telemetry",
      arguments: {
        metric: "ble_disconnects_24h",
        window: "current",
        firmware_version: "1.4.2",
      },
      result_summary: "aggregates_returned",
      latency_ms: 1,
      tokens: 0,
    },
  ],
});

describe("EVAL-02 firmware identification", () => {
  it("passes when the trace pins 1.4.2 and a finding label names it", () => {
    expect(firmwareIdentified(pinnedAndNamed)).toEqual({
      in_trace: true,
      in_findings: true,
    });
    const result = eval02(ctxFor(pinnedAndNamed));
    expect(result.pass).toBe(true);
  });

  it("fails recent-firmware prose when the trace pins 1.4.2 but no finding or hypothesis names a version", () => {
    expect(recentFirmwareProse.leading_hypothesis.statement).not.toMatch(/\d+\.\d+/);
    expect(
      recentFirmwareProse.deterministic_findings.every((row) => !/\d+\.\d+/.test(row.label)),
    ).toBe(true);
    expect(firmwareIdentified(recentFirmwareProse)).toEqual({
      in_trace: true,
      in_findings: false,
    });
    const result = eval02(ctxFor(recentFirmwareProse));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/deterministic_findings label/);
  });
});
