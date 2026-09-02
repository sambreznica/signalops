import { describe, expect, it } from "vitest";
import {
  carryFindings,
  ceilingCopy,
  challengeResolution,
  evidenceTypeCopy,
  formatMultiplier,
  headlineComparison,
  leadPoint,
  splitFirstSentence,
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
    const findings = rec!.output.deterministic_findings;
    const f1 = findings.find((f) => f.id === "f_1");
    const f2 = findings.find((f) => f.id === "f_2");
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    expect(f1!.unit).toBe(f2!.unit);
    expect(formatMultiplier(f1!.value / f2!.value)).toBe("6.83×");
    const pair = headlineComparison([f1!, f2!]);
    expect(pair!.left.id).toBe("f_1");
    expect(pair!.right.id).toBe("f_2");
    expect(
      carryFindings(findings, pair).map((f) => f.id),
    ).toEqual(["f_1", "f_2", "f_5"]);
  });

  it("splits a claim from its qualification without breaking 1.4.2", () => {
    const split = splitFirstSentence(
      "1.4.2 devices show a disconnect rate roughly seven times that of 1.4.1 devices in the current window, with the rate-ratio CI excluding one, per {f_3}. Both cohorts are on app version 3.2.",
    );
    expect(split.lead).toMatch(/\{f_3\}\.$/);
    expect(split.rest).toMatch(/^Both cohorts/);
  });

  it("leads unresolved items with the point after so", () => {
    const point = leadPoint(
      "Phone OS/model was not held constant in this investigation, so a phone-side confound analogous to INC-2025-014 has not been excluded.",
    );
    expect(point.lead).toMatch(/^A phone-side confound/);
    expect(point.rest).toMatch(/not held constant/);
  });

  it("names how the firmware challenge resolved", () => {
    const run = loadReplayRun();
    const rec = recordForCandidate(run, DEFAULT_CANDIDATE_ID);
    expect(challengeResolution(rec!.output.alternative_hypotheses)).toBe(
      "The critic proposed a phone-OS explanation. It was tested and could not be ruled out.",
    );
  });
});
