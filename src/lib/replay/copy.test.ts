import { describe, expect, it } from "vitest";
import {
  carryFindings,
  ceilingCopy,
  evidenceTypeCopy,
  formatMultiplier,
  headlineComparison,
  stopReasonCopy,
} from "./copy";
import { DEFAULT_CANDIDATE_ID, loadReplayRun, recordForCandidate } from "./load";
import type { DeterministicFinding } from "../schema/investigation";

const findings: DeterministicFinding[] = [
  {
    id: "f_1",
    label: "BLE disconnect rate, firmware 1.4.2, current window",
    value: 10.53,
    unit: "disconnects_per_device_day",
    source: { kind: "tool_call", call_id: "tc_2" },
  },
  {
    id: "f_2",
    label: "BLE disconnect rate, firmware 1.4.1, current window",
    value: 1.5416666666666667,
    unit: "disconnects_per_device_day",
    source: { kind: "tool_call", call_id: "tc_2" },
  },
  {
    id: "f_3",
    label: "Rate ratio",
    value: 0.146,
    unit: "ratio",
    source: { kind: "tool_call", call_id: "tc_2" },
  },
];

describe("investigation copy", () => {
  it("names stop and ceiling in product language", () => {
    expect(stopReasonCopy("validation_exhausted")).toMatch(/usable write-up/);
    expect(stopReasonCopy("wall_clock")).toMatch(/time/);
    expect(stopReasonCopy("call_cap")).toMatch(/limit/);
    expect(ceilingCopy("correlational_evidence")).toMatch(/association/);
    expect(ceilingCopy("unrebutted_counter_evidence")).toMatch(/not answered/);
    expect(evidenceTypeCopy("correlational")).toBe("association, not proven cause");
  });

  it("picks the firmware rate pair as the headline comparison", () => {
    const pair = headlineComparison(findings);
    expect(pair).not.toBeNull();
    expect(pair!.left.id).toBe("f_1");
    expect(pair!.right.id).toBe("f_2");
    expect(pair!.ratio).toBeCloseTo(6.83, 1);
    expect(formatMultiplier(pair!.ratio)).toBe("6.83×");
    expect(carryFindings(findings, pair).map((f) => f.id)).toEqual([
      "f_1",
      "f_2",
    ]);
  });

  it("reads the firmware artefact the same way", () => {
    const run = loadReplayRun();
    const rec = recordForCandidate(run, DEFAULT_CANDIDATE_ID);
    const pair = headlineComparison(rec!.output.deterministic_findings);
    expect(pair!.left.id).toBe("f_1");
    expect(pair!.right.id).toBe("f_2");
    expect(formatMultiplier(pair!.ratio)).toBe("6.83×");
    expect(carryFindings(rec!.output.deterministic_findings, pair).map((f) => f.id)).toEqual(
      ["f_1", "f_2", "f_5"],
    );
  });
});
