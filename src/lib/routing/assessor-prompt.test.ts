import { describe, expect, it } from "vitest";
import { versionSubstrings } from "../agent/prompt";
import { loadRoster } from "./fixtures";
import {
  ASSESSOR_SYSTEM_PROMPT,
  buildAssessorUserMessage,
} from "./assessor-prompt";
import { SKILL_IDS } from "../schema/ticket";

const PROMPT_WORD_BLOCKLIST = [
  "1.4.2",
  "1.4.1",
  "3.2",
  "confound",
  "SIG-",
  "regression",
  "not real",
  "noise cluster",
  "app version",
] as const;

function stripSkillIds(text: string): string {
  let hay = text;
  const skills = [...SKILL_IDS].sort((a, b) => b.length - a.length);
  for (const id of skills) {
    hay = hay.split(id).join(" ");
  }
  return hay;
}

describe("assessor system prompt", () => {
  it("contains no version-like substring", () => {
    expect(versionSubstrings(ASSESSOR_SYSTEM_PROMPT)).toEqual([]);
  });

  it("contains none of the word-list leaks", () => {
    for (const word of PROMPT_WORD_BLOCKLIST) {
      expect(ASSESSOR_SYSTEM_PROMPT, word).not.toContain(word);
    }
  });

  it("contains no queue ids or engineer ids once skill ids are stripped", () => {
    const hay = stripSkillIds(ASSESSOR_SYSTEM_PROMPT);
    for (const queue of ["firmware", "hardware", "product_comms", "data_telemetry"]) {
      expect(hay, queue).not.toContain(queue);
    }
    for (const eng of loadRoster()) {
      expect(ASSESSOR_SYSTEM_PROMPT).not.toContain(eng.id);
      expect(ASSESSOR_SYSTEM_PROMPT).not.toContain(eng.name);
    }
    expect(ASSESSOR_SYSTEM_PROMPT).not.toMatch(/\bWIP\b/i);
    expect(ASSESSOR_SYSTEM_PROMPT).not.toContain("P1");
    expect(ASSESSOR_SYSTEM_PROMPT).not.toContain("due_at");
  });

  it("asks for the kind of work, not a digit ban with nowhere to put a figure", () => {
    expect(ASSESSOR_SYSTEM_PROMPT).toContain(
      "Name the kind of work, not its measurements",
    );
    expect(ASSESSOR_SYSTEM_PROMPT).not.toContain("unrepresentable");
    expect(ASSESSOR_SYSTEM_PROMPT).not.toContain("{f_n}");
  });
});

describe("buildAssessorUserMessage", () => {
  it("contains no queue ids or engineer ids", () => {
    const message = buildAssessorUserMessage({
      action_id: "a_1",
      description: "Tag the cluster as a known cosmetic UI issue.",
      risk_class: "INTERNAL",
      title: "Overheating tag cluster",
      summary: "The cluster is a chrome colour warning, not a thermal event.",
      status: "NOT_AN_INCIDENT",
      severity_band: "MEDIUM",
      leading_hypothesis: "The tag is a known UI warning colour.",
    });
    expect(versionSubstrings(message)).toEqual([]);
    expect(message).not.toContain("SIG-");
    const hay = stripSkillIds(message);
    for (const queue of ["firmware", "hardware", "product_comms", "data_telemetry"]) {
      expect(hay, queue).not.toContain(queue);
    }
    for (const eng of loadRoster()) {
      expect(message).not.toContain(eng.id);
      expect(message).not.toContain(eng.name);
    }
    expect(message).not.toContain("granted");
    expect(message).not.toContain("model_requested");
  });
});
