import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasBareNumeral } from "../../../evals/numerals";
import type { TriageCandidate } from "../triage/types";
import { createMemoryCache } from "./cache";
import {
  investigate,
  CRITIC_TIMEOUT_MS,
  MAX_CRITIC_ROUNDS,
  MAX_CRITIC_TOOL_CALLS,
  MAX_TOOL_CALLS,
  TIMEOUT_MS,
  type ModelClient,
  type ModelResponse,
} from "./investigator";
import { buildUserMessage } from "./prompt";
import type { ToolRuntime } from "./tools/types";

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
    delta_ratio: null,
    prior_events: qty(12, "events"),
    ratio_ci_low: null,
    ratio_ci_high: null,
    ci_excludes_one: false,
    trend: "flat",
    severity_index: qty(1, "index"),
    band: "MEDIUM",
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

function emptyRuntime(): ToolRuntime {
  return {
    telemetry: [],
    feedback: [],
    taxonomy: [],
    embeddings: { model: "test", dims: 1, chunks: [] },
    embedQuery: async () => [0],
  };
}

function validModelJson(): string {
  return JSON.stringify({
    investigation_id: "x",
    signal_id: ID,
    title: "Candidate investigation",
    status: "UNCERTAIN",
    severity: qty(1, "index"),
    confidence: {
      granted: "HIGH",
      model_requested: "HIGH",
      ceiling_rule_applied: null,
    },
    summary: "Investigation remains uncertain.",
    affected_cohort: qty(40, "users"),
    leading_hypothesis: {
      statement: "The candidate is not yet confirmed.",
      evidence_type: "correlational",
    },
    alternative_hypotheses: [],
    deterministic_findings: [],
    supporting_evidence: [],
    counter_evidence: [],
    knowledge_sources: [],
    recommended_actions: [],
    uncertainty: ["Further measurement would be needed."],
    trace: [],
  });
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

const toolTurn: ModelResponse = {
  content: [
    {
      type: "tool_use",
      id: "u1",
      name: "query_telemetry",
      input: { metric: "battery_drain_pct", window: "current" },
    },
  ],
  usage: { input_tokens: 2, output_tokens: 2 },
};

const jsonTurn: ModelResponse = {
  content: [{ type: "text", text: validModelJson() }],
  usage: { input_tokens: 2, output_tokens: 4 },
};

describe("investigate", () => {
  const candidate = stubCandidate();

  it("keeps the critic-round bound named for item ten", () => {
    expect(MAX_CRITIC_ROUNDS).toBe(2);
  });

  it("gives the critic its own call and wall budget", () => {
    expect(MAX_TOOL_CALLS).toBe(12);
    expect(TIMEOUT_MS).toBe(120_000);
    expect(MAX_CRITIC_TOOL_CALLS).toBe(4);
    expect(CRITIC_TIMEOUT_MS).toBe(60_000);
  });

  it("leaves granted null even when the model writes a band", async () => {
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([jsonTurn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.output.confidence.granted).toBeNull();
    expect(outcome.bound_stopped).toBe(false);
    expect(outcome.output.confidence.model_requested).toBe("HIGH");
    expect(outcome.output.confidence.ceiling_rule_applied).toBeNull();
    expect(outcome.output.signal_id).toBe(ID);
  });

  it("records empty tool results and cache counters", async () => {
    const cache = createMemoryCache();
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([toolTurn, toolTurn, jsonTurn]),
      cache,
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.metrics.tool_calls).toBe(2);
    expect(outcome.metrics.cache_misses).toBe(1);
    expect(outcome.metrics.cache_hits).toBe(1);
    expect(outcome.output.trace).toHaveLength(2);
    expect(outcome.output.trace[0]).toMatchObject({
      kind: "tool_call",
      call_id: "tc_1",
      result_summary: "filter_matched_no_devices",
    });
    expect(outcome.output.trace[1]).toMatchObject({
      call_id: "tc_2",
      result_summary: "filter_matched_no_devices cache_hit",
    });
    for (const event of outcome.output.trace) {
      if (event.kind === "tool_call") {
        expect(hasBareNumeral(event.result_summary)).toBe(false);
      }
    }
  });

  it("terminates INCONCLUSIVE after the tool-call bound", async () => {
    const client: ModelClient = {
      async complete() {
        return toolTurn;
      },
    };
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client,
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.bound_stopped).toBe(true);
    expect(outcome.output.confidence.granted).toBeNull();
    expect(outcome.metrics.tool_calls).toBe(MAX_TOOL_CALLS);
    expect(outcome.output.uncertainty[0]).toMatch(/tool-call bound/);
    expect(outcome.output.deterministic_findings.length).toBe(MAX_TOOL_CALLS);
    expect(
      outcome.output.deterministic_findings.every(
        (f) => f.source.kind === "tool_call",
      ),
    ).toBe(true);
    expect(hasBareNumeral(outcome.output.summary)).toBe(false);
    expect(hasBareNumeral(outcome.output.uncertainty[0] ?? "")).toBe(false);
  });

  it("treats an orphan call_id as a repair-triggering failure", async () => {
    const bad = JSON.parse(validModelJson()) as Record<string, unknown>;
    bad.deterministic_findings = [
      {
        id: "f_1",
        label: "invented rate",
        value: 1,
        unit: "x",
        source: { kind: "tool_call", call_id: "tc_99" },
      },
    ];
    const text = JSON.stringify(bad);
    const turn: ModelResponse = {
      content: [{ type: "text", text }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([turn, turn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.output.uncertainty[0]).toMatch(/validation/);
  });

  it("treats an orphan finding reference as a repair-triggering failure", async () => {
    const bad = JSON.parse(validModelJson()) as Record<string, unknown>;
    bad.summary = "Rate rose to {f_9} against the prior window.";
    const text = JSON.stringify(bad);
    const turn: ModelResponse = {
      content: [{ type: "text", text }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([turn, turn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.output.uncertainty[0]).toMatch(/validation/);
  });

  it("treats a bare numeral in prose as a repair-triggering failure", async () => {
    const bad = JSON.parse(validModelJson()) as Record<string, unknown>;
    bad.summary = "Twenty two is written as 22 in this sentence.";
    const text = JSON.stringify(bad);
    const turn: ModelResponse = {
      content: [{ type: "text", text }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([turn, turn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.output.uncertainty[0]).toMatch(/validation/);
  });

  it("accepts a resolved finding reference in prose", async () => {
    const good = JSON.parse(validModelJson()) as Record<string, unknown>;
    good.summary = "Rate rose to {f_1} against the prior window.";
    good.deterministic_findings = [
      {
        id: "f_1",
        label: "ble_disconnects_24h rate",
        value: 6.8,
        unit: "ratio",
        source: { kind: "triage", signal_id: ID },
      },
    ];
    const turn: ModelResponse = {
      content: [{ type: "text", text: JSON.stringify(good) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([turn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
    });
    expect(outcome.output.status).toBe("UNCERTAIN");
    expect(outcome.bound_stopped).toBe(false);
    expect(outcome.output.summary).toContain("{f_1}");
  });

  it("terminates INCONCLUSIVE after the wall-clock bound", async () => {
    const start = 1_000;
    let n = 0;
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([jsonTurn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
      now: () => {
        n += 1;
        return n === 1 ? start : start + TIMEOUT_MS + 1;
      },
    });
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.bound_stopped).toBe(true);
    expect(outcome.output.uncertainty[0]).toMatch(/wall-clock bound/);
  });

  it("keeps tool-derived findings when the wall-clock bound fires after calls", async () => {
    let n = 0;
    const outcome = await investigate(candidate, {
      runtime: emptyRuntime(),
      client: scriptedClient([toolTurn, jsonTurn]),
      cache: createMemoryCache(),
      userMessage: buildUserMessage(candidate),
      now: () => {
        n += 1;
        return n < 5 ? 1_000 : 1_000 + TIMEOUT_MS + 1;
      },
    });
    expect(outcome.output.status).toBe("INCONCLUSIVE");
    expect(outcome.output.trace.length).toBeGreaterThan(0);
    expect(outcome.output.deterministic_findings.length).toBeGreaterThan(0);
    expect(outcome.output.leading_hypothesis.statement).toMatch(/bound/);
    expect(outcome.output.recommended_actions).toEqual([]);
  });
});

describe("investigator source", () => {
  it("never writes a confidence band to granted", () => {
    const source = readFileSync(
      path.resolve(__dirname, "investigator.ts"),
      "utf8",
    );
    const grantedWrites = [...source.matchAll(/granted:\s*([^\n,]+)/g)].map(
      (m) => m[1]!.trim(),
    );
    expect(grantedWrites.length).toBeGreaterThan(0);
    expect(grantedWrites.every((value) => value === "null")).toBe(true);
  });
});
