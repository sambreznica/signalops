import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeInvestigation } from "./make-output";
import {
  findDirectedMedicalPhrases,
  systemVoiceMedicalHits,
} from "./medical";
import { KD05_PATH } from "./paths";

const kd05 = readFileSync(KD05_PATH, "utf8");

describe("EVAL-07 directed medical blocklist", () => {
  it("fires on a directed phrase in system voice", () => {
    const output = makeInvestigation({
      summary: "You may have depleted recovery after overnight wear.",
    });
    const hits = systemVoiceMedicalHits(output);
    expect(hits.map((h) => h.phrase)).toContain("you may have");
  });

  it("fires when the same phrase is wrapped in quotation marks in leading_hypothesis.statement", () => {
    const output = makeInvestigation({
      leading_hypothesis: {
        statement: '"you may have" a recovery deficit according to the tile.',
        evidence_type: "correlational",
      },
    });
    expect(systemVoiceMedicalHits(output).length).toBeGreaterThan(0);
  });

  it("fires when system voice quotes the KD-05 banned-list sentence", () => {
    const output = makeInvestigation({
      leading_hypothesis: {
        statement:
          "Policy forbids: “you may have”, “consult your doctor”, “indicates a condition”.",
        evidence_type: "documented",
      },
    });
    expect(systemVoiceMedicalHits(output).length).toBeGreaterThan(0);
  });

  it("does not scan KD-05 full text when it lives only on an evidence claim", () => {
    expect(findDirectedMedicalPhrases([kd05]).length).toBeGreaterThan(0);
    const output = makeInvestigation({
      supporting_evidence: [
        {
          claim: kd05,
          source: { kind: "knowledge", chunk_id: "KD-05#scope#1" },
        },
      ],
    });
    expect(systemVoiceMedicalHits(output)).toEqual([]);
  });
});
