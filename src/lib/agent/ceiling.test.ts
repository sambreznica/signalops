import { describe, expect, it } from "vitest";
import { makeInvestigation } from "../../../evals/make-output";
import {
  applyCeiling,
  ceilingDecision,
  criticAppendedCounterEvidence,
} from "./ceiling";

describe("ceilingDecision", () => {
  it("caps HIGH to MEDIUM when evidence is correlational", () => {
    const decided = ceilingDecision({
      requested: "HIGH",
      evidence_type: "correlational",
      affected_cohort: 100,
      unrebutted_critic_counter_evidence: false,
    });
    expect(decided.granted).toBe("MEDIUM");
    expect(decided.rule).toBe("correlational_evidence");
  });

  it("does not override MEDIUM or LOW on correlational evidence", () => {
    expect(
      ceilingDecision({
        requested: "MEDIUM",
        evidence_type: "correlational",
        affected_cohort: 100,
        unrebutted_critic_counter_evidence: false,
      }),
    ).toEqual({ granted: "MEDIUM", rule: null });
    expect(
      ceilingDecision({
        requested: "LOW",
        evidence_type: "correlational",
        affected_cohort: 100,
        unrebutted_critic_counter_evidence: false,
      }),
    ).toEqual({ granted: "LOW", rule: null });
  });

  it("caps HIGH when unrebutted critic counter-evidence exists", () => {
    const decided = ceilingDecision({
      requested: "HIGH",
      evidence_type: "causal",
      affected_cohort: 100,
      unrebutted_critic_counter_evidence: true,
    });
    expect(decided.granted).toBe("MEDIUM");
    expect(decided.rule).toBe("unrebutted_counter_evidence");
  });

  it("caps HIGH when affected cohort is below 25", () => {
    const decided = ceilingDecision({
      requested: "HIGH",
      evidence_type: "documented",
      affected_cohort: 24,
      unrebutted_critic_counter_evidence: false,
    });
    expect(decided.granted).toBe("MEDIUM");
    expect(decided.rule).toBe("cohort_below_25");
  });

  it("allows HIGH at cohort 25 with causal evidence and no critic objection", () => {
    expect(
      ceilingDecision({
        requested: "HIGH",
        evidence_type: "causal",
        affected_cohort: 25,
        unrebutted_critic_counter_evidence: false,
      }),
    ).toEqual({ granted: "HIGH", rule: null });
  });

  it("records correlational_evidence first when several rules fire", () => {
    const decided = ceilingDecision({
      requested: "HIGH",
      evidence_type: "correlational",
      affected_cohort: 10,
      unrebutted_critic_counter_evidence: true,
    });
    expect(decided.granted).toBe("MEDIUM");
    expect(decided.rule).toBe("correlational_evidence");
  });

  it("caps a correlational NOT_AN_INCIDENT HIGH the same as any other status", () => {
    const decided = ceilingDecision({
      requested: "HIGH",
      evidence_type: "correlational",
      affected_cohort: 23,
      unrebutted_critic_counter_evidence: false,
    });
    expect(decided.granted).toBe("MEDIUM");
    expect(decided.rule).toBe("correlational_evidence");
  });
});

const INVESTIGATOR_CE = {
  claim: "App version shipped in the same window.",
  source: { kind: "tool_call" as const, call_id: "call-1" },
};

describe("criticAppendedCounterEvidence", () => {
  it("ignores investigator-listed counter-evidence", () => {
    const investigator = makeInvestigation({
      counter_evidence: [INVESTIGATOR_CE],
    });
    expect(criticAppendedCounterEvidence(investigator, investigator)).toBe(
      false,
    );
  });

  it("detects a claim the critic appended", () => {
    const investigator = makeInvestigation();
    const post = makeInvestigation({
      counter_evidence: [
        INVESTIGATOR_CE,
        {
          claim: "Devices on the prior firmware at the same app version match baseline.",
          source: { kind: "tool_call", call_id: "call-1" },
        },
      ],
    });
    expect(
      criticAppendedCounterEvidence(
        post,
        makeInvestigation({ counter_evidence: [INVESTIGATOR_CE] }),
      ),
    ).toBe(true);
  });
});

describe("applyCeiling", () => {
  it("is the writer of granted and leaves model_requested untouched", () => {
    const investigator = makeInvestigation({
      confidence: {
        granted: null,
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
      leading_hypothesis: {
        statement: "Firmware change coincides with disconnect rate.",
        evidence_type: "correlational",
      },
      affected_cohort: {
        value: 100,
        unit: "users",
        source: { kind: "triage", signal_id: "cnd_fw_1_4_2" },
      },
    });
    const capped = applyCeiling(investigator, investigator);
    expect(capped.confidence.model_requested).toBe("HIGH");
    expect(capped.confidence.granted).toBe("MEDIUM");
    expect(capped.confidence.ceiling_rule_applied).toBe("correlational_evidence");
    const event = capped.trace.find((e) => e.kind === "ceiling_applied");
    expect(event).toEqual({
      kind: "ceiling_applied",
      requested: "HIGH",
      granted: "MEDIUM",
      rule: "correlational_evidence",
    });
  });

  it("does not punish investigator counter-evidence on a causal HIGH request", () => {
    const investigator = makeInvestigation({
      confidence: {
        granted: null,
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
      leading_hypothesis: {
        statement: "A documented mechanism in the retrieved passage accounts for the rate.",
        evidence_type: "causal",
      },
      affected_cohort: {
        value: 40,
        unit: "users",
        source: { kind: "triage", signal_id: "cnd_fw_1_4_2" },
      },
      counter_evidence: [INVESTIGATOR_CE],
    });
    const capped = applyCeiling(investigator, investigator);
    expect(capped.confidence.granted).toBe("HIGH");
    expect(capped.confidence.ceiling_rule_applied).toBeNull();
    expect(capped.trace.some((e) => e.kind === "ceiling_applied")).toBe(false);
  });

  it("caps HIGH when the critic appended counter-evidence", () => {
    const investigator = makeInvestigation({
      confidence: {
        granted: null,
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
      leading_hypothesis: {
        statement: "A documented mechanism in the retrieved passage accounts for the rate.",
        evidence_type: "causal",
      },
      affected_cohort: {
        value: 40,
        unit: "users",
        source: { kind: "triage", signal_id: "cnd_fw_1_4_2" },
      },
      counter_evidence: [INVESTIGATOR_CE],
    });
    const post = makeInvestigation({
      confidence: {
        granted: null,
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
      leading_hypothesis: investigator.leading_hypothesis,
      affected_cohort: investigator.affected_cohort,
      counter_evidence: [
        INVESTIGATOR_CE,
        {
          claim: "The hold-filter on the prior firmware matches baseline.",
          source: { kind: "tool_call", call_id: "call-1" },
        },
      ],
    });
    const capped = applyCeiling(post, investigator);
    expect(capped.confidence.granted).toBe("MEDIUM");
    expect(capped.confidence.ceiling_rule_applied).toBe(
      "unrebutted_counter_evidence",
    );
  });

  it("does not mutate the post-critic record", () => {
    const investigator = makeInvestigation({
      confidence: {
        granted: null,
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
    });
    const before = JSON.stringify(investigator);
    applyCeiling(investigator, investigator);
    expect(JSON.stringify(investigator)).toBe(before);
  });
});
