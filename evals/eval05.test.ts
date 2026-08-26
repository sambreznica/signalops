import { describe, expect, it } from "vitest";
import type { InvestigationOutput } from "../src/lib/schema/investigation";
import type { TriageCandidate } from "../src/lib/triage/types";
import { eval05 } from "./assertions";
import type { CertificationRun, InvestigationRecord } from "./artefact";
import { recordIsCompleted } from "./artefact";
import type { HarnessContext } from "./load";
import { makeInvestigation } from "./make-output";

const PRIMARIES = [
  { id: "SIG-001", candidate_id: "cnd_fw_1_4_2" },
  { id: "SIG-002", candidate_id: "cnd_tag_skin_irritation" },
  { id: "SIG-003", candidate_id: "cnd_tag_claims_interpretation" },
  { id: "SIG-004", candidate_id: "cnd_tag_overheating" },
] as const;

const ALT = {
  statement: "A parallel release accounts for the same observations.",
  evidence_type: "correlational" as const,
  status: "open" as const,
  falsifying_test:
    "Devices on the prior firmware at the same app version show the elevated rate.",
};

function withAlts(output: InvestigationOutput): InvestigationOutput {
  return { ...output, alternative_hypotheses: [ALT] };
}

function record(
  candidate_id: string,
  output: InvestigationOutput,
  extra: Partial<InvestigationRecord> = {},
): InvestigationRecord {
  return {
    candidate_id,
    output,
    pre_critic: extra.pre_critic ?? null,
    stop_reason: extra.stop_reason,
    bound_stopped: extra.bound_stopped,
    metrics: {
      tool_calls: 1,
      tokens: 0,
      wall_clock_ms: 1,
      cache_hits: 0,
      cache_misses: 1,
    },
  };
}

function ctxFor(rows: InvestigationRecord[]): HarnessContext {
  const run: CertificationRun = {
    run_id: "eval05-fixture",
    timestamp: "2026-05-18T00:00:00Z",
    model: "test",
    effort: "medium",
    n: 1,
    kind: "agent",
    investigations: rows,
    approvals: [],
    execution_log: [],
  };
  return {
    sidecar: [],
    candidates: PRIMARIES.map((p) => ({ id: p.candidate_id }) as TriageCandidate),
    matches: PRIMARIES.map((p) => ({
      reference_id: p.id,
      matched: true,
      match_set: [],
      union_coverage: 1,
      primary: {
        candidate_id: p.candidate_id,
        precision: 1,
        coverage: 1,
        jaccard: 1,
      },
    })),
    embeddings: { model: "test", dims: 0, chunks: [] },
    run,
    runError: null,
  };
}

function fourCompleted(mutate: (rows: InvestigationRecord[]) => void): HarnessContext {
  const rows = PRIMARIES.map((p) => {
    const output = withAlts(makeInvestigation({ signal_id: p.candidate_id }));
    return record(p.candidate_id, output, { pre_critic: output });
  });
  mutate(rows);
  return ctxFor(rows);
}

describe("eval05", () => {
  it("does not fail (a) on a bound-stopped primary with empty alternatives", () => {
    const ctx = fourCompleted((rows) => {
      const bound = makeInvestigation({
        signal_id: "cnd_fw_1_4_2",
        status: "INCONCLUSIVE",
        alternative_hypotheses: [],
        leading_hypothesis: {
          statement: "No conclusion was reached inside the bound.",
          evidence_type: "correlational",
        },
      });
      rows[0] = record("cnd_fw_1_4_2", bound, {
        pre_critic: bound,
        stop_reason: "wall_clock",
      });
      const post = {
        ...rows[1]!.output,
        status: "UNCERTAIN" as const,
      };
      rows[1] = record(rows[1]!.candidate_id, post, {
        pre_critic: rows[1]!.output,
      });
    });
    const result = eval05(ctx);
    expect(result.pass).toBe(true);
  });

  it("does not fail (a) when validation_exhausted left empty alternatives", () => {
    const ctx = fourCompleted((rows) => {
      const wiped = makeInvestigation({
        signal_id: "cnd_fw_1_4_2",
        status: "INCONCLUSIVE",
        alternative_hypotheses: [],
      });
      rows[0] = record("cnd_fw_1_4_2", wiped, {
        pre_critic: wiped,
        stop_reason: "validation_exhausted",
      });
      const post = {
        ...rows[1]!.output,
        status: "UNCERTAIN" as const,
      };
      rows[1] = record(rows[1]!.candidate_id, post, {
        pre_critic: rows[1]!.output,
      });
    });
    expect(eval05(ctx).pass).toBe(true);
  });

  it("treats a legacy bound_stopped record as incomplete", () => {
    expect(
      recordIsCompleted(
        record("cnd_fw_1_4_2", makeInvestigation(), { bound_stopped: true }),
      ),
    ).toBe(false);
    expect(
      recordIsCompleted(record("cnd_fw_1_4_2", makeInvestigation(), {})),
    ).toBe(true);
  });

  it("fails (a) when a completed investigation has empty alternatives", () => {
    const ctx = fourCompleted((rows) => {
      const empty = makeInvestigation({
        signal_id: "cnd_fw_1_4_2",
        alternative_hypotheses: [],
      });
      rows[0] = record("cnd_fw_1_4_2", empty, { pre_critic: empty });
    });
    const result = eval05(ctx);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/alternative_hypotheses/);
  });

  it("counts a model_requested change as the confidence-band leg of (b)", () => {
    const ctx = fourCompleted((rows) => {
      const pre = rows[1]!.output;
      const post = {
        ...pre,
        confidence: {
          ...pre.confidence,
          model_requested: "LOW" as const,
        },
      };
      rows[1] = record(rows[1]!.candidate_id, post, { pre_critic: pre });
    });
    expect(eval05(ctx).pass).toBe(true);
  });

  it("does not count a granted-only change as critic effect", () => {
    const ctx = fourCompleted((rows) => {
      const pre = rows[1]!.output;
      const post = {
        ...pre,
        confidence: {
          ...pre.confidence,
          granted: "LOW" as const,
        },
      };
      rows[1] = record(rows[1]!.candidate_id, post, { pre_critic: pre });
    });
    const result = eval05(ctx);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no pre_critic snapshot differs/);
  });
});
