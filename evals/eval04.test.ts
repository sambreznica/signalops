import { describe, expect, it } from "vitest";
import type { TriageCandidate } from "../src/lib/triage/types";
import { eval04 } from "./assertions";
import type { HarnessContext } from "./load";
import { makeInvestigation } from "./make-output";
import type { InvestigationOutput } from "../src/lib/schema/investigation";
import type { CertificationRun } from "./artefact";

function record(candidate_id: string, output: InvestigationOutput) {
  return {
    candidate_id,
    output,
    pre_critic: null,
    metrics: {
      tool_calls: 1,
      tokens: 0,
      wall_clock_ms: 1,
      cache_hits: 0,
      cache_misses: 1,
    },
  };
}

function ctxFor(rows: { candidate_id: string; output: InvestigationOutput }[]): HarnessContext {
  const candidates = rows.map((row) => ({ id: row.candidate_id }) as TriageCandidate);
  const run: CertificationRun = {
    run_id: "eval04-fixture",
    timestamp: "2026-05-18T00:00:00Z",
    model: "test",
    effort: "medium",
    n: 1,
    kind: "agent",
    investigations: rows.map((row) => record(row.candidate_id, row.output)),
    approvals: [],
    execution_log: [],
  };
  return {
    sidecar: [],
    candidates,
    matches: [],
    embeddings: { model: "test", dims: 0, chunks: [] },
    run,
    runError: null,
  };
}

const clean = makeInvestigation({
  summary: "Rate rose to {f_1} against a baseline of {f_2}.",
  deterministic_findings: [
    {
      id: "f_1",
      label: "ble_disconnects_24h rate on 1.4.2",
      value: 10.5,
      unit: "disconnects_per_device_day",
      source: { kind: "tool_call", call_id: "call-1" },
    },
    {
      id: "f_2",
      label: "ble_disconnects_24h rate on 1.4.1",
      value: 1.5,
      unit: "disconnects_per_device_day",
      source: { kind: "tool_call", call_id: "call-1" },
    },
  ],
});

describe("EVAL-04 scores every investigation in the run", () => {
  it("fails when a non-SIG-001 investigation has a bare numeral", () => {
    const dirty = makeInvestigation({
      signal_id: "cnd_tag_skin_irritation",
      summary: "The cluster covers 22 affected users.",
      severity: {
        value: 1.4,
        unit: "index",
        source: { kind: "triage", signal_id: "cnd_tag_skin_irritation" },
      },
      affected_cohort: {
        value: 22,
        unit: "users",
        source: { kind: "triage", signal_id: "cnd_tag_skin_irritation" },
      },
    });
    const result = eval04(
      ctxFor([
        { candidate_id: "cnd_fw_1_4_2", output: clean },
        { candidate_id: "cnd_tag_skin_irritation", output: dirty },
      ]),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/cnd_tag_skin_irritation/);
  });

  it("passes when every investigation in the run is clean", () => {
    const other = makeInvestigation({
      signal_id: "cnd_tag_overheating",
      summary: "The overheating tag is a mislabel of KI-NW-014.",
      severity: {
        value: 1,
        unit: "index",
        source: { kind: "triage", signal_id: "cnd_tag_overheating" },
      },
      affected_cohort: {
        value: 23,
        unit: "users",
        source: { kind: "triage", signal_id: "cnd_tag_overheating" },
      },
    });
    const result = eval04(
      ctxFor([
        { candidate_id: "cnd_fw_1_4_2", output: clean },
        { candidate_id: "cnd_tag_overheating", output: other },
      ]),
    );
    expect(result.pass).toBe(true);
  });
});
