import { describe, expect, it } from "vitest";
import {
  correlationalCausalHits,
  findUnhedgedCausalVerbs,
} from "./causal";
import { makeInvestigation } from "./make-output";

const KD06_CAUSE =
  "Engineering treated the 1.3.0 connection-interval tightening as the cause of a February disconnect ticket cluster. That reading was later withdrawn.";

describe("EVAL-04c correlational causal verbs", () => {
  it("allows a release-note description without a causal verb", () => {
    expect(
      findUnhedgedCausalVerbs([
        "the release notes describe a change to retry backoff",
      ]),
    ).toEqual([]);
  });

  it("fails on unhedged caused in a correlational leading statement", () => {
    const output = makeInvestigation({
      leading_hypothesis: {
        statement: "shortened backoff caused disconnects",
        evidence_type: "correlational",
      },
    });
    expect(correlationalCausalHits(output).length).toBeGreaterThan(0);
  });

  it("does not scan KD-06 historical causal nouns on an evidence claim", () => {
    const output = makeInvestigation({
      supporting_evidence: [
        {
          claim: KD06_CAUSE,
          source: { kind: "knowledge", chunk_id: "KD-06#inc-2025-014#1" },
        },
      ],
    });
    expect(correlationalCausalHits(output)).toEqual([]);
  });

  it("fails when that same excerpt is the correlational leading statement", () => {
    const output = makeInvestigation({
      leading_hypothesis: {
        statement: "Firmware 1.3.0 caused the February disconnect cluster.",
        evidence_type: "correlational",
      },
    });
    expect(correlationalCausalHits(output).length).toBeGreaterThan(0);
  });

  it("does not treat the noun cause as a hit", () => {
    expect(findUnhedgedCausalVerbs([KD06_CAUSE])).toEqual([]);
  });
});
