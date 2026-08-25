import { describe, expect, it } from "vitest";
import {
  investigationOutputSchema,
  quantitySchema,
  type InvestigationOutput,
} from "./index";

function validInvestigation(
  overrides: Record<string, unknown> = {},
): InvestigationOutput {
  const base = {
    investigation_id: "inv-001",
    signal_id: "SIG-001",
    title: "Connectivity cluster",
    status: "INCONCLUSIVE",
    severity: {
      value: 1.4,
      unit: "index",
      source: { kind: "triage", signal_id: "SIG-001" },
    },
    confidence: {
      granted: "MEDIUM",
      model_requested: "HIGH",
      ceiling_rule_applied: "correlational_evidence",
    },
    summary: "Investigation did not complete a conclusion.",
    affected_cohort: {
      value: 40,
      unit: "users",
      source: { kind: "tool_call", call_id: "call-1" },
    },
    leading_hypothesis: {
      statement: "Firmware change coincides with disconnect rate.",
      evidence_type: "correlational",
    },
    alternative_hypotheses: [],
    deterministic_findings: [
      {
        label: "disconnect rate window",
        value: 12.5,
        unit: "per_thousand_device_days",
        source: { kind: "knowledge", chunk_id: "KD-01-c3" },
      },
    ],
    supporting_evidence: [
      {
        claim: "Release notes describe a connectivity change.",
        source: { kind: "knowledge", chunk_id: "KD-02-c1" },
      },
    ],
    counter_evidence: [
      {
        claim: "App version shipped in the same window.",
        source: { kind: "tool_call", call_id: "call-2" },
      },
    ],
    knowledge_sources: [
      {
        doc_id: "KD-02",
        title: "Firmware Release Notes",
        section: "1.4.2",
        chunk_id: "KD-02-c1",
        score: 0.81,
      },
    ],
    recommended_actions: [
      {
        action_id: "act-1",
        description: "Open an engineering investigation.",
        risk_class: "INTERNAL",
      },
    ],
    uncertainty: ["App version remains a confound."],
    trace: [
      {
        kind: "tool_call",
        call_id: "call-1",
        actor: "investigator",
        tool: "query_telemetry",
        arguments: { window: "current" },
        result_summary: "Cohort rates returned.",
        latency_ms: 12,
        tokens: 40,
      },
      {
        kind: "ceiling_applied",
        requested: "HIGH",
        granted: "MEDIUM",
        rule: "correlational_evidence",
      },
      {
        kind: "critic_effect",
        effect: "confidence_changed",
        detail: "Requested band refused by ceiling.",
      },
    ],
  };

  return investigationOutputSchema.parse({ ...base, ...overrides });
}

describe("investigation output schema freeze", () => {
  it("parses a valid object including all three provenance kinds and all three trace kinds", () => {
    const parsed = validInvestigation();
    expect(parsed.status).toBe("INCONCLUSIVE");
    expect(parsed.alternative_hypotheses).toEqual([]);
    expect(parsed.severity.source).toEqual({
      kind: "triage",
      signal_id: "SIG-001",
    });
    expect(parsed.affected_cohort.source).toEqual({
      kind: "tool_call",
      call_id: "call-1",
    });
    expect(parsed.deterministic_findings[0]?.source).toEqual({
      kind: "knowledge",
      chunk_id: "KD-01-c3",
    });
    expect(parsed.trace.map((event) => event.kind)).toEqual([
      "tool_call",
      "ceiling_applied",
      "critic_effect",
    ]);
  });

  it("allows granted null so a missing ceiling cannot silently pass as the model's band", () => {
    const parsed = validInvestigation({
      confidence: {
        granted: null,
        model_requested: "HIGH",
        ceiling_rule_applied: null,
      },
    });
    expect(parsed.confidence.granted).toBeNull();
    expect(parsed.confidence.model_requested).toBe("HIGH");
  });

  it("rejects numeric confidence", () => {
    expect(() =>
      investigationOutputSchema.parse({
        ...validInvestigation(),
        confidence: 0.89,
      }),
    ).toThrow();
    expect(() =>
      investigationOutputSchema.parse({
        ...validInvestigation(),
        confidence: {
          granted: 0.9,
          model_requested: "HIGH",
          ceiling_rule_applied: null,
        },
      }),
    ).toThrow();
  });

  it("rejects the old source_tool_call_id Quantity shape", () => {
    const result = quantitySchema.safeParse({
      value: 40,
      unit: "users",
      source_tool_call_id: "call-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown provenance kind", () => {
    const result = quantitySchema.safeParse({
      value: 40,
      unit: "users",
      source: { kind: "model", call_id: "x" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bare number in a claim field", () => {
    expect(() =>
      investigationOutputSchema.parse({
        ...validInvestigation(),
        affected_cohort: 40,
      }),
    ).toThrow();
  });

  it("rejects requires_approval as an unknown key", () => {
    const parsed = validInvestigation();
    const result = investigationOutputSchema.safeParse({
      ...parsed,
      recommended_actions: [
        {
          ...parsed.recommended_actions[0],
          requires_approval: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown tool name", () => {
    const parsed = validInvestigation();
    const result = investigationOutputSchema.safeParse({
      ...parsed,
      trace: [
        {
          kind: "tool_call",
          call_id: "call-1",
          actor: "investigator",
          tool: "get_release_notes",
          arguments: {},
          result_summary: "no",
          latency_ms: 1,
          tokens: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown ceiling rule", () => {
    const parsed = validInvestigation();
    const result = investigationOutputSchema.safeParse({
      ...parsed,
      confidence: {
        granted: "MEDIUM",
        model_requested: "HIGH",
        ceiling_rule_applied: "because_i_said_so",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a diagnosis-capable extra field", () => {
    const result = investigationOutputSchema.safeParse({
      ...validInvestigation(),
      diagnosis: "arrhythmia",
    });
    expect(result.success).toBe(false);
  });
});
