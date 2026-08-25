import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../fixtures/constants";
import type { FeedbackRecord, TagTaxonomyEntry, TelemetryRecord } from "../fixtures/types";
import { firmwareCandidateId, runTriage, tagCandidateId } from "../triage";
import {
  buildUserMessage,
  INVESTIGATOR_SYSTEM_PROMPT,
  versionSubstrings,
} from "./prompt";

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

const root = path.resolve(__dirname, "../../..");

function loadJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(path.join(root, "synthetic-data", name), "utf8"),
  ) as T;
}

const candidates = runTriage({
  telemetry: loadJson<TelemetryRecord[]>("telemetry.json"),
  feedback: loadJson<FeedbackRecord[]>("feedback.json"),
  taxonomy: loadJson<TagTaxonomyEntry[]>("tag-taxonomy.json"),
  current: { start: CURRENT_WINDOW_START, end: CURRENT_WINDOW_END },
  prior: { start: PRIOR_WINDOW_START, end: PRIOR_WINDOW_END },
});

describe("investigator system prompt", () => {
  it("contains no version-like substring", () => {
    expect(versionSubstrings(INVESTIGATOR_SYSTEM_PROMPT)).toEqual([]);
  });

  it("contains none of the word-list leaks", () => {
    const hay = INVESTIGATOR_SYSTEM_PROMPT;
    for (const word of PROMPT_WORD_BLOCKLIST) {
      expect(hay, word).not.toContain(word);
    }
  });
});

describe("buildUserMessage", () => {
  it("puts no version-like substring in a tag candidate message", () => {
    const candidate = candidates.find(
      (c) => c.id === tagCandidateId("overheating"),
    );
    expect(candidate).toBeDefined();
    const message = buildUserMessage(candidate!);
    expect(versionSubstrings(message)).toEqual([]);
    expect(message).not.toContain("SIG-");
    expect(message).not.toContain("is_real");
    expect(message).not.toContain("firmware_version:");
  });

  it("exempts only the firmware slice key on a firmware candidate", () => {
    const candidate = candidates.find(
      (c) => c.id === firmwareCandidateId("1.4.2"),
    );
    expect(candidate).toBeDefined();
    expect(candidate!.firmware_version).toBe("1.4.2");
    const message = buildUserMessage(candidate!);
    const matches = versionSubstrings(message);
    expect(matches.length).toBeGreaterThan(0);
    expect([...new Set(matches)]).toEqual([candidate!.firmware_version]);
    const withoutSlice = message.replaceAll(candidate!.firmware_version!, "");
    expect(versionSubstrings(withoutSlice)).toEqual([]);
  });
});
