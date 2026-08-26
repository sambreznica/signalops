import { describe, expect, it } from "vitest";
import { makeInvestigation } from "../../../evals/make-output";
import type { TriageCandidate } from "../triage/types";
import { buildCriticUserMessage, CRITIC_SYSTEM_PROMPT } from "./critic-prompt";
import { versionSubstrings } from "./prompt";

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

const EVALUATIVE_FRAMING = [
  "review",
  "assess",
  "evaluate",
  "is this correct",
  "is this good",
  "check whether",
  "quality of",
] as const;

function stubCandidate(): TriageCandidate {
  return {
    id: "cnd_tag_overheating",
    kind: "tag",
    tag: "overheating",
    firmware_version: null,
    consequence_class: "SAFETY_ADJACENT",
    device_ids: ["KL-0001"],
    affected_users: {
      value: 40,
      unit: "users",
      source: { kind: "triage", signal_id: "cnd_tag_overheating" },
    },
    rate_window: {
      value: 1,
      unit: "percent_per_device_day",
      source: { kind: "triage", signal_id: "cnd_tag_overheating" },
    },
    rate_prior: {
      value: 1,
      unit: "percent_per_device_day",
      source: { kind: "triage", signal_id: "cnd_tag_overheating" },
    },
    delta_ratio: null,
    prior_events: {
      value: 12,
      unit: "events",
      source: { kind: "triage", signal_id: "cnd_tag_overheating" },
    },
    ratio_ci_low: null,
    ratio_ci_high: null,
    band: "LOW",
    trend: "flat",
    ci_excludes_one: false,
    delta_factor_floored: false,
    severity_index: {
      value: 1,
      unit: "index",
      source: { kind: "triage", signal_id: "cnd_tag_overheating" },
    },
    severity_inputs: {
      affected_users: 40,
      fleet_size: 400,
      rate_window: 1,
      rate_prior: 1,
      prior_events: 12,
      trend: "flat",
      consequence_class: "SAFETY_ADJACENT",
    },
  };
}

describe("critic system prompt", () => {
  it("contains no version-like substring", () => {
    expect(versionSubstrings(CRITIC_SYSTEM_PROMPT)).toEqual([]);
  });

  it("contains none of the word-list leaks", () => {
    for (const word of PROMPT_WORD_BLOCKLIST) {
      expect(CRITIC_SYSTEM_PROMPT, word).not.toContain(word);
    }
  });

  it("contains no evaluative framing", () => {
    const hay = CRITIC_SYSTEM_PROMPT.toLocaleLowerCase();
    for (const phrase of EVALUATIVE_FRAMING) {
      expect(hay, phrase).not.toContain(phrase);
    }
  });
});

describe("buildCriticUserMessage", () => {
  it("omits the confidence object and does not nudge a stop", () => {
    const output = makeInvestigation({
      confidence: {
        granted: "HIGH",
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
      trace: [
        {
          kind: "tool_call",
          call_id: "tc_1",
          actor: "investigator",
          tool: "query_telemetry",
          arguments: { window: "current" },
          result_summary: "aggregates_returned",
          latency_ms: 1,
          tokens: 0,
        },
      ],
    });
    const message = buildCriticUserMessage(stubCandidate(), output);
    expect(message).not.toContain("granted");
    expect(message).not.toContain("model_requested");
    expect(message).not.toContain("ceiling_rule_applied");
    expect(message).not.toMatch(/"confidence"/);
    expect(message).not.toContain("Stop calling tools");
    expect(message).toContain("tc_1");
  });
});
