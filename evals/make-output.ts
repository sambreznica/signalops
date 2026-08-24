import { investigationOutputSchema } from "../src/lib/schema/investigation";
import type { InvestigationOutput } from "../src/lib/schema/investigation";

export function makeInvestigation(
  overrides: Record<string, unknown> = {},
): InvestigationOutput {
  const base = {
    investigation_id: "inv-test",
    signal_id: "cnd_fw_1_4_2",
    title: "Connectivity cluster",
    status: "INCONCLUSIVE",
    severity: {
      value: 1.4,
      unit: "index",
      source: { kind: "triage", signal_id: "cnd_fw_1_4_2" },
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
    deterministic_findings: [],
    supporting_evidence: [],
    counter_evidence: [],
    knowledge_sources: [],
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
    ],
  };
  return investigationOutputSchema.parse({ ...base, ...overrides });
}
