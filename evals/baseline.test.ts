import { describe, expect, it } from "vitest";
import { BASELINE_SYSTEM_PROMPT, BASELINE_USER_PREAMBLE } from "./baseline-prompt";
import { buildBaselinePack } from "./baseline-pack";
import {
  BASELINE_RUN_ID,
  SUBJECT_TO_SIDECAR,
  baselineEmitSchema,
  extractJsonObject,
  normaliseBaselineEmit,
  stampSubject,
} from "./baseline-stamp";
import { loadHarnessContext, primaryCandidate } from "./load";
import { BASELINE_LINE_TAG, formatResults, mergeBaselineSection } from "./report";

const subject = {
  title: "Firmware disconnects",
  status: "UNCERTAIN" as const,
  summary: "Rate is elevated on the named train.",
  model_requested: "MEDIUM" as const,
  leading_hypothesis: {
    statement: "The radio supervisor rewrite is associated with the rise.",
    evidence_type: "correlational" as const,
  },
  alternative_hypotheses: [],
  findings: [
    { label: "ble_disconnects_24h firmware 1.4.2 current", value: 10.53, unit: "per_device_day" },
  ],
  knowledge_chunk_ids: ["KD-02#ble-1-4-2#1", "KD-99#invented#1"],
  recommended_actions: [
    { description: "Hold the train.", risk_class: "PRODUCTION" as const },
  ],
  uncertainty: ["app co-occurrence is unresolved"],
};

describe("baseline stamp", () => {
  it("maps subjects onto sidecar ids only in the harness", () => {
    expect(SUBJECT_TO_SIDECAR).toEqual({
      firmware: "SIG-001",
      skin_irritation: "SIG-002",
      claims_interpretation: "SIG-003",
      overheating: "SIG-004",
    });
    expect(BASELINE_SYSTEM_PROMPT).not.toMatch(/SIG-00/);
    expect(BASELINE_USER_PREAMBLE).not.toMatch(/SIG-00/);
  });

  it("does not put sidecar ids in the data pack either", () => {
    expect(buildBaselinePack()).not.toMatch(/SIG-00/);
  });

  it("stamps candidate identity, empty trace, dropped unknown chunks", () => {
    const ctx = loadHarnessContext();
    const candidate = primaryCandidate(ctx, "SIG-001");
    expect(candidate).toBeDefined();
    const realChunk = ctx.embeddings.chunks.find(
      (c) => c.doc_id === "KD-02" && c.section.includes("1.4.2"),
    );
    expect(realChunk).toBeDefined();
    const output = stampSubject(
      {
        ...subject,
        knowledge_chunk_ids: [realChunk!.chunk_id, "KD-99#invented#1"],
      },
      candidate!,
      ctx.embeddings,
    );
    expect(output.signal_id).toBe(candidate!.id);
    expect(output.investigation_id).toBe(`inv_${candidate!.id}`);
    expect(output.trace).toEqual([]);
    expect(output.confidence.granted).toBeNull();
    expect(output.confidence.ceiling_rule_applied).toBeNull();
    expect(output.knowledge_sources.map((k) => k.chunk_id)).toEqual([
      realChunk!.chunk_id,
    ]);
    expect(output.knowledge_sources[0]?.score).toBe(0);
    expect(output.deterministic_findings[0]?.label).toContain("1.4.2");
    expect(output.deterministic_findings[0]?.source).toEqual({
      kind: "triage",
      signal_id: candidate!.id,
    });
  });

  it("fills omitted arrays so a near-complete emit parses", () => {
    const parsed = baselineEmitSchema.safeParse(
      normaliseBaselineEmit({
        firmware: {
          title: "a",
          status: "INCONCLUSIVE",
          summary: "s",
          model_requested: "LOW",
          leading_hypothesis: {
            statement: "unknown",
            evidence_type: "correlational",
          },
        },
        skin_irritation: {
          title: "b",
          status: "INCONCLUSIVE",
          summary: "s",
          model_requested: "LOW",
          leading_hypothesis: {
            statement: "unknown",
            evidence_type: "correlational",
          },
        },
        claims_interpretation: {
          title: "c",
          status: "INCONCLUSIVE",
          summary: "s",
          model_requested: "LOW",
          leading_hypothesis: {
            statement: "unknown",
            evidence_type: "correlational",
          },
        },
        overheating: {
          title: "d",
          status: "NOT_AN_INCIDENT",
          summary: "s",
          model_requested: "HIGH",
          leading_hypothesis: {
            statement: "known issue",
            evidence_type: "documented",
          },
        },
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firmware.findings).toEqual([]);
      expect(parsed.data.overheating.status).toBe("NOT_AN_INCIDENT");
    }
  });

  it("extracts a fenced JSON object", () => {
    const raw = extractJsonObject('note\n```json\n{"ok":true}\n```\n');
    expect(raw).toEqual({ ok: true });
  });
});

describe("baseline evidence merge", () => {
  it("tags every eval line and preserves the agent section", () => {
    const tagged = formatResults(
      "# Baseline (neutral subset)",
      [
        {
          id: "EVAL-02",
          pass: false,
          expected: "trace pins 1.4.2",
          actual: "in_trace=false",
          reason: "empty trace",
        },
      ],
      ["scope"],
      BASELINE_LINE_TAG,
    );
    expect(tagged).toContain(
      "EVAL-02  FAIL  [neutral subset only; EVAL-04/05/08/09 not scored]",
    );
    const merged = mergeBaselineSection(
      "# Eval suite (agent)\nrun: run-board-1\n",
      tagged,
    );
    expect(merged).toContain("# Eval suite (agent)");
    expect(merged).toContain("# Baseline (neutral subset)");
    expect(BASELINE_RUN_ID).toBe("run-baseline");
  });
});
