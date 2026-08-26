import { describe, expect, it } from "vitest";
import { makeInvestigation } from "../../../evals/make-output";
import { createMemoryCache } from "./cache";
import {
  applyCriticPatch,
  bandDowngradeAllowed,
  cloneOutput,
  criticise,
  skipCritic,
  statusDowngradeAllowed,
  type CriticPatch,
} from "./critic";
import type { ModelClient, ModelResponse } from "./investigator";
import type { ToolRuntime } from "./tools/types";
import type { TriageCandidate } from "../triage/types";

const ID = "cnd_tag_overheating";

function qty(value: number, unit: string) {
  return {
    value,
    unit,
    source: { kind: "triage" as const, signal_id: ID },
  };
}

function stubCandidate(): TriageCandidate {
  return {
    id: ID,
    kind: "tag",
    tag: "overheating",
    firmware_version: null,
    consequence_class: "SAFETY_ADJACENT",
    device_ids: ["KL-0001"],
    affected_users: qty(40, "users"),
    rate_window: qty(1, "percent_per_device_day"),
    rate_prior: qty(1, "percent_per_device_day"),
    prior_events: qty(12, "events"),
    delta_ratio: null,
    ratio_ci_low: null,
    ratio_ci_high: null,
    ci_excludes_one: false,
    trend: "flat",
    severity_index: qty(1, "index"),
    band: "LOW",
    delta_factor_floored: false,
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

function investigatorOutput(overrides: Record<string, unknown> = {}) {
  return makeInvestigation({
    signal_id: ID,
    severity: qty(1, "index"),
    affected_cohort: qty(40, "users"),
    ...overrides,
  });
}

function emptyRuntime(): ToolRuntime {
  return {
    telemetry: [],
    feedback: [],
    taxonomy: [],
    embeddings: { model: "test", dims: 1, chunks: [] },
    embedQuery: async () => [0],
  };
}

function scriptedClient(turns: ModelResponse[]): ModelClient {
  const queue = [...turns];
  return {
    async complete() {
      const next = queue.shift();
      if (!next) throw new Error("script exhausted");
      return next;
    },
  };
}

const ALT = {
  statement: "A seasonal pattern accounts for the same observations.",
  evidence_type: "correlational" as const,
  status: "open" as const,
  falsifying_test:
    "The prior window at the same firmware shows the same rate.",
};

function patchJson(overrides: Partial<CriticPatch> = {}): string {
  return JSON.stringify({
    alternative_hypotheses: [ALT],
    ...overrides,
  });
}

describe("statusDowngradeAllowed", () => {
  it("allows weakening an incident claim and refuses strengthening one", () => {
    expect(statusDowngradeAllowed("CONFIRMED", "UNCERTAIN")).toBe(true);
    expect(statusDowngradeAllowed("CONFIRMED", "NOT_AN_INCIDENT")).toBe(true);
    expect(statusDowngradeAllowed("NOT_AN_INCIDENT", "UNCERTAIN")).toBe(false);
    expect(statusDowngradeAllowed("INCONCLUSIVE", "CONFIRMED")).toBe(false);
  });
});

describe("bandDowngradeAllowed", () => {
  it("allows lowering a band and refuses raising one", () => {
    expect(bandDowngradeAllowed("HIGH", "LOW")).toBe(true);
    expect(bandDowngradeAllowed("LOW", "HIGH")).toBe(false);
  });
});

describe("skipCritic", () => {
  it("does not mutate the investigator snapshot", () => {
    const original = makeInvestigation({
      leading_hypothesis: {
        statement: "No conclusion was reached inside the bound.",
        evidence_type: "correlational",
      },
      alternative_hypotheses: [],
    });
    const before = JSON.stringify(original);
    const skipped = skipCritic(original, "wall_clock");
    expect(JSON.stringify(original)).toBe(before);
    expect(skipped.trace.some((e) => e.kind === "critic_effect" && e.effect === "skipped")).toBe(
      true,
    );
    expect(skipped.trace.some((e) => e.kind === "critic_effect" && e.detail.includes("wall_clock"))).toBe(
      true,
    );
    expect(skipped.alternative_hypotheses).toEqual([]);
  });
});

describe("applyCriticPatch", () => {
  it("downgrades status and always writes granted null", () => {
    const investigator = makeInvestigation({
      status: "CONFIRMED",
      confidence: {
        granted: "HIGH",
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
    });
    const next = applyCriticPatch(investigator, {
      alternative_hypotheses: [ALT],
      status: "UNCERTAIN",
      model_requested: "LOW",
    });
    expect(next.status).toBe("UNCERTAIN");
    expect(next.confidence.model_requested).toBe("LOW");
    expect(next.confidence.granted).toBeNull();
    expect(
      next.trace.some((e) => e.kind === "critic_effect" && e.effect === "status_downgraded"),
    ).toBe(true);
  });

  it("records a refused status upgrade with the proposed value and the rule", () => {
    const investigator = makeInvestigation({
      status: "NOT_AN_INCIDENT",
      confidence: {
        granted: null,
        model_requested: "LOW",
        ceiling_rule_applied: null,
      },
    });
    const next = applyCriticPatch(investigator, {
      alternative_hypotheses: [ALT],
      status: "UNCERTAIN",
    });
    expect(next.status).toBe("NOT_AN_INCIDENT");
    expect(next.alternative_hypotheses).toEqual([ALT]);
    const refused = next.trace.find(
      (e) => e.kind === "critic_effect" && e.effect === "status_upgrade_refused",
    );
    expect(refused).toBeDefined();
    if (refused?.kind !== "critic_effect") throw new Error("expected critic_effect");
    expect(refused.detail).toContain("UNCERTAIN");
    expect(refused.detail).toMatch(/less evidence/);
  });

  it("records a refused band upgrade", () => {
    const investigator = makeInvestigation({
      confidence: {
        granted: null,
        model_requested: "LOW",
        ceiling_rule_applied: null,
      },
    });
    const next = applyCriticPatch(investigator, {
      alternative_hypotheses: [ALT],
      model_requested: "HIGH",
    });
    expect(next.confidence.model_requested).toBe("LOW");
    expect(
      next.trace.some((e) => e.kind === "critic_effect" && e.effect === "band_upgrade_refused"),
    ).toBe(true);
  });
});

describe("criticise", () => {
  it("applies a patch without rewriting investigator findings", async () => {
    const investigator = investigatorOutput({
      confidence: {
        granted: null,
        model_requested: "MEDIUM",
        ceiling_rule_applied: null,
      },
      deterministic_findings: [
        {
          id: "f_1",
          label: "battery_drain_pct rate",
          value: 1,
          unit: "ratio",
          source: { kind: "triage", signal_id: ID },
        },
      ],
    });
    const snapshot = cloneOutput(investigator);
    const outcome = await criticise(investigator, {
      runtime: emptyRuntime(),
      client: scriptedClient([
        {
          content: [{ type: "text", text: patchJson({ status: "INCONCLUSIVE" }) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ]),
      cache: createMemoryCache(),
      candidate: stubCandidate(),
    });
    expect(JSON.stringify(investigator)).toBe(JSON.stringify(snapshot));
    expect(outcome.skipped).toBe(false);
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.output.deterministic_findings).toEqual(snapshot.deterministic_findings);
    expect(outcome.output.alternative_hypotheses).toHaveLength(1);
  });

  it("abandons on validation failure after repair and keeps investigator fields", async () => {
    const investigator = investigatorOutput({
      summary: "Investigator summary stands.",
      status: "UNCERTAIN",
    });
    const bad: ModelResponse = {
      content: [{ type: "text", text: "not json" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const outcome = await criticise(investigator, {
      runtime: emptyRuntime(),
      client: scriptedClient([bad, bad]),
      cache: createMemoryCache(),
      candidate: stubCandidate(),
    });
    expect(outcome.output.summary).toBe("Investigator summary stands.");
    expect(outcome.output.status).toBe("UNCERTAIN");
    expect(
      outcome.output.trace.some((e) => e.kind === "critic_effect" && e.effect === "abandoned"),
    ).toBe(true);
  });

  it("records critic tool calls with actor critic", async () => {
    const investigator = investigatorOutput();
    const outcome = await criticise(investigator, {
      runtime: emptyRuntime(),
      client: scriptedClient([
        {
          content: [
            {
              type: "tool_use",
              id: "u1",
              name: "query_telemetry",
              input: { metric: "battery_drain_pct", window: "current" },
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
        {
          content: [{ type: "text", text: patchJson() }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ]),
      cache: createMemoryCache(),
      candidate: stubCandidate(),
    });
    const calls = outcome.output.trace.filter((e) => e.kind === "tool_call");
    const criticCalls = calls.filter((e) => e.kind === "tool_call" && e.actor === "critic");
    expect(criticCalls.length).toBeGreaterThan(0);
  });
});
