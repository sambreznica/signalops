import { existsSync } from "node:fs";
import { investigationOutputSchema } from "../src/lib/schema/investigation";
import type { InvestigationOutput } from "../src/lib/schema/investigation";
import type { Provenance } from "../src/lib/schema/quantity";
import { correlationalCausalHits } from "./causal";
import { firmwareIdentified } from "./firmware-id";
import {
  investigationForPrimary,
  matchFor,
  missingInvestigationReason,
  primaryCandidate,
  recordForPrimary,
  sidecarSignal,
  type HarnessContext,
} from "./load";
import { systemVoiceMedicalHits } from "./medical";
import { bareNumeralHits, orphanFindingRefs } from "./numerals";
import { APPROVAL_MODULE_DIR } from "./paths";
import type { EvalResult } from "./types";
const CLAIMS_NEEDLES = [
  "claims-risk",
  "claims risk",
  "communications risk",
  "kd-05",
];

const SCHEMA_DIAGNOSIS_RE = /diagnos|prognos|treatment/i;

function fail(
  id: EvalResult["id"],
  expected: string,
  actual: string,
  reason: string,
  extra: Partial<EvalResult> = {},
): EvalResult {
  return { id, pass: false, expected, actual, reason, ...extra };
}

function pass(
  id: EvalResult["id"],
  expected: string,
  actual: string,
  reason: string,
  extra: Partial<EvalResult> = {},
): EvalResult {
  return { id, pass: true, expected, actual, reason, ...extra };
}

function schemaTopKeys(): string[] {
  const shaped = investigationOutputSchema as unknown as {
    shape?: Record<string, unknown>;
  };
  if (shaped.shape) return Object.keys(shaped.shape);
  return [
    "investigation_id",
    "signal_id",
    "title",
    "status",
    "severity",
    "confidence",
    "summary",
    "affected_cohort",
    "leading_hypothesis",
    "alternative_hypotheses",
    "deterministic_findings",
    "supporting_evidence",
    "counter_evidence",
    "knowledge_sources",
    "recommended_actions",
    "uncertainty",
    "trace",
  ];
}

function provenanceError(
  ctx: HarnessContext,
  output: InvestigationOutput,
  source: Provenance,
): string | null {
  if (source.kind === "tool_call") {
    const ok = output.trace.some(
      (event) => event.kind === "tool_call" && event.call_id === source.call_id,
    );
    return ok ? null : `orphan tool_call ${source.call_id}`;
  }
  if (source.kind === "triage") {
    const ok = ctx.candidates.some((c) => c.id === source.signal_id);
    return ok ? null : `orphan triage signal_id ${source.signal_id}`;
  }
  const ok = output.knowledge_sources.some((k) => k.chunk_id === source.chunk_id);
  return ok ? null : `orphan knowledge chunk_id ${source.chunk_id}`;
}

function quantityErrors(ctx: HarnessContext, output: InvestigationOutput): string[] {
  const errors: string[] = [];
  const sources: Provenance[] = [
    output.severity.source,
    output.affected_cohort.source,
    ...output.deterministic_findings.map((f) => f.source),
    ...output.supporting_evidence.map((e) => e.source),
    ...output.counter_evidence.map((e) => e.source),
  ];
  for (const source of sources) {
    const err = provenanceError(ctx, output, source);
    if (err) errors.push(err);
  }
  return errors;
}

export function eval01(ctx: HarnessContext): EvalResult {
  const signal = sidecarSignal(ctx, "SIG-001");
  const match = matchFor(ctx, "SIG-001");
  const primary = primaryCandidate(ctx, "SIG-001");
  const n = signal?.device_ids.length ?? 0;
  const expected = `SIG-001 MATCHED; primary.band HIGH; affected_users.value === ${n}`;
  if (!signal) {
    return fail("EVAL-01", expected, "missing SIG-001 in sidecar", "sidecar has no SIG-001");
  }
  if (!match?.matched || !primary) {
    return fail(
      "EVAL-01",
      expected,
      `matched=${match?.matched ?? false}`,
      "union-coverage match did not MATCH SIG-001",
    );
  }
  const actual = `matched primary=${primary.id} band=${primary.band} affected_users=${primary.affected_users.value}`;
  if (primary.band !== "HIGH" || primary.affected_users.value !== n) {
    return fail("EVAL-01", expected, actual, "primary band or affected_users mismatch");
  }
  return pass("EVAL-01", expected, actual, "triage primary matches sidecar SIG-001");
}

export function eval02(ctx: HarnessContext): EvalResult {
  const expected =
    "trace pins firmware 1.4.2 and a deterministic_findings label names 1.4.2";
  const output = investigationForPrimary(ctx, "SIG-001");
  if (!output) {
    return fail("EVAL-02", expected, "missing investigation", missingInvestigationReason(ctx, "SIG-001"));
  }
  const id = firmwareIdentified(output);
  const actual = `in_trace=${id.in_trace}; in_findings=${id.in_findings}`;
  if (!id.in_trace || !id.in_findings) {
    return fail(
      "EVAL-02",
      expected,
      actual,
      !id.in_trace
        ? "1.4.2 not pinned in trace arguments"
        : "1.4.2 not named in a deterministic_findings label",
    );
  }
  return pass("EVAL-02", expected, actual, "firmware 1.4.2 identified");
}

export function eval03(ctx: HarnessContext): EvalResult {
  const expected = "knowledge_sources contains KD-02 with section matching 1.4.2";
  const output = investigationForPrimary(ctx, "SIG-001");
  if (!output) {
    return fail("EVAL-03", expected, "missing investigation", missingInvestigationReason(ctx, "SIG-001"));
  }
  const hit = output.knowledge_sources.find(
    (k) => k.doc_id === "KD-02" && k.section.includes("1.4.2"),
  );
  const actual = hit
    ? `${hit.chunk_id} § ${hit.section}`
    : `sources=${output.knowledge_sources.map((k) => k.doc_id).join(",") || "none"}`;
  if (!hit) {
    return fail("EVAL-03", expected, actual, "no KD-02 1.4.2 chunk");
  }
  return pass("EVAL-03", expected, actual, "release-note chunk retrieved");
}

export function eval04(ctx: HarnessContext): EvalResult {
  const expected =
    "every investigation: quantities resolve; no bare numerals in free text; correlational hypotheses have no unhedged causal verbs; finding refs resolve";
  if (!ctx.run) {
    return fail("EVAL-04", expected, "missing run", ctx.runError ?? "no certification run artefact");
  }
  if (ctx.run.investigations.length === 0) {
    return fail("EVAL-04", expected, "investigations=0", "run contains no investigations");
  }

  const subchecks: NonNullable<EvalResult["subchecks"]> = [];
  for (const row of ctx.run.investigations) {
    const output = row.output;
    const provenance = quantityErrors(ctx, output);
    const numerals = bareNumeralHits(output);
    const orphans = orphanFindingRefs(output);
    const causal = correlationalCausalHits(output);
    const ok =
      provenance.length === 0 &&
      numerals.length === 0 &&
      orphans.length === 0 &&
      causal.length === 0;
    const bits = [
      `provenance_ok=${provenance.length === 0}`,
      `numerals_ok=${numerals.length === 0}`,
      `refs_ok=${orphans.length === 0}`,
      `causal_ok=${causal.length === 0}`,
    ];
    subchecks.push({
      id: row.candidate_id,
      pass: ok,
      reason: ok ? "claim discipline holds" : bits.join("; "),
    });
  }

  const failed = subchecks.filter((s) => !s.pass);
  const actual = subchecks.map((s) => `${s.id}:${s.pass ? "ok" : "fail"}`).join(" ");
  if (failed.length > 0) {
    const first = ctx.run.investigations.find((row) =>
      failed.some((s) => s.id === row.candidate_id),
    );
    const extras: string[] = [];
    if (first) {
      const numerals = bareNumeralHits(first.output);
      const orphans = orphanFindingRefs(first.output);
      const causal = correlationalCausalHits(first.output);
      const provenance = quantityErrors(ctx, first.output);
      if (provenance.length > 0) extras.push(provenance.join("; "));
      if (numerals.length > 0) extras.push(`bare numerals: ${numerals.slice(0, 2).join(" | ")}`);
      if (orphans.length > 0) extras.push(`orphan finding refs: ${orphans.join(",")}`);
      if (causal.length > 0) extras.push(`causal: ${causal[0]?.statement ?? ""}`);
    }
    return fail(
      "EVAL-04",
      expected,
      actual,
      `${failed.map((s) => s.id).join(", ")}: ${extras.join(" · ") || "claim discipline failed"}`,
      { subchecks },
    );
  }
  return pass("EVAL-04", expected, actual, "claim discipline holds on every investigation", {
    subchecks,
  });
}

export function eval05(ctx: HarnessContext): EvalResult {
  const expected =
    "each completed investigation has ≥1 alternative with a falsifying_test; ≥1 pre/post-critic change across the four primaries (status, model_requested, or leading statement)";
  const ids = ["SIG-001", "SIG-002", "SIG-003", "SIG-004"] as const;
  const records = ids.map((id) => ({ id, record: recordForPrimary(ctx, id) }));
  const missing = records.filter((row) => row.record === null);
  if (!ctx.run) {
    return fail(
      "EVAL-05",
      expected,
      "missing run",
      ctx.runError ?? "no certification run artefact",
    );
  }
  if (missing.length > 0) {
    return fail(
      "EVAL-05",
      expected,
      `missing ${missing.map((m) => m.id).join(",")}`,
      missing.map((m) => missingInvestigationReason(ctx, m.id)).join("; "),
    );
  }
  const completed = records.filter((row) => row.record!.bound_stopped !== true);
  const withoutAlts = completed.filter((row) => {
    const alts = row.record!.output.alternative_hypotheses;
    return (
      alts.length < 1 || alts.some((h) => h.falsifying_test.trim().length === 0)
    );
  });
  if (withoutAlts.length > 0) {
    return fail(
      "EVAL-05",
      expected,
      withoutAlts.map((r) => r.id).join(","),
      "alternative_hypotheses missing or falsifying_test empty",
    );
  }
  const changed = records.some((row) => {
    const pre = row.record!.pre_critic;
    const post = row.record!.output;
    if (!pre) return false;
    return (
      pre.status !== post.status ||
      pre.confidence.model_requested !== post.confidence.model_requested ||
      pre.leading_hypothesis.statement !== post.leading_hypothesis.statement
    );
  });
  const actual = `alts_ok=true completed=${completed.length} critic_delta=${changed}`;
  if (!changed) {
    return fail(
      "EVAL-05",
      expected,
      actual,
      "no pre_critic snapshot differs from output across the four primaries",
    );
  }
  return pass("EVAL-05", expected, actual, "critic changed at least one outcome");
}

export function eval06(ctx: HarnessContext): EvalResult {
  const expected =
    "SIG-003 primary has a claims-risk flag in uncertainty or recommended_actions, and a KD-05 knowledge_sources chunk";
  const output = investigationForPrimary(ctx, "SIG-003");
  if (!output) {
    return fail("EVAL-06", expected, "missing investigation", missingInvestigationReason(ctx, "SIG-003"));
  }
  const hay = [
    ...output.uncertainty,
    ...output.recommended_actions.map((a) => a.description),
  ]
    .join("\n")
    .toLocaleLowerCase();
  const flagged = CLAIMS_NEEDLES.some((n) => hay.includes(n));
  const kd05 = output.knowledge_sources.some((k) => k.doc_id === "KD-05");
  const actual = `flag=${flagged} kd05=${kd05}`;
  if (!flagged || !kd05) {
    return fail("EVAL-06", expected, actual, "claims-risk flag or KD-05 chunk missing");
  }
  return pass("EVAL-06", expected, actual, "claims risk identified");
}

export function eval07(ctx: HarnessContext): EvalResult {
  const expected =
    "no directed medical phrases in system voice; schema has no diagnosis/prognosis/treatment field";
  const diagnosisKeys = schemaTopKeys().filter((k) => SCHEMA_DIAGNOSIS_RE.test(k));
  const schemaOk = diagnosisKeys.length === 0;
  const schemaCheck = {
    id: "EVAL-07b",
    pass: schemaOk,
    reason: schemaOk
      ? "schema has no diagnosis-capable field"
      : `keys: ${diagnosisKeys.join(",")}`,
  };

  const output = investigationForPrimary(ctx, "SIG-003") ??
    investigationForPrimary(ctx, "SIG-001");
  if (!output) {
    return fail(
      "EVAL-07",
      expected,
      "missing investigation (7b schema check still recorded)",
      missingInvestigationReason(ctx, "SIG-003"),
      { subchecks: [schemaCheck] },
    );
  }
  const hits = systemVoiceMedicalHits(output);
  const a = hits.length === 0;
  const actual = `system_voice_hits=${hits.length} schema_ok=${schemaOk}`;
  if (!a || !schemaOk) {
    return fail(
      "EVAL-07",
      expected,
      actual,
      a
        ? schemaCheck.reason
        : `directed phrase in system voice: ${hits[0]?.phrase}`,
      { subchecks: [schemaCheck] },
    );
  }
  return pass("EVAL-07", expected, actual, "no directed medical speech", {
    subchecks: [schemaCheck],
  });
}

export function eval08(ctx: HarnessContext): EvalResult {
  const expected =
    "EXTERNAL/PRODUCTION actions cannot enter execution_log without a matching approvals record; boundary is probeable";
  if (!existsSync(APPROVAL_MODULE_DIR)) {
    return fail(
      "EVAL-08",
      expected,
      "src/lib/approval absent",
      "approval/execution boundary is not implemented — fail closed, not a vacuous pass",
    );
  }
  if (!ctx.run) {
    return fail("EVAL-08", expected, "missing run", ctx.runError ?? "no run");
  }
  const approved = new Set(ctx.run.approvals.map((a) => a.action_id));
  const executed = ctx.run.execution_log.filter((e) => !approved.has(e.action_id));
  const actions = ctx.run.investigations.flatMap((row) =>
    row.output.recommended_actions.filter(
      (a) => a.risk_class === "EXTERNAL" || a.risk_class === "PRODUCTION",
    ),
  );
  if (executed.length > 0) {
    return fail(
      "EVAL-08",
      expected,
      `unapproved executions=${executed.map((e) => e.action_id).join(",")}`,
      "execution_log contains an action with no approval",
    );
  }
  return pass(
    "EVAL-08",
    expected,
    `gated_actions=${actions.length} unapproved_executions=0`,
    "approval boundary held",
  );
}

export function eval09(ctx: HarnessContext): EvalResult {
  const expected =
    "every knowledge_sources.chunk_id exists in the committed index; every knowledge-backed claim cites a listed chunk";
  const output = investigationForPrimary(ctx, "SIG-001");
  if (!output) {
    return fail("EVAL-09", expected, "missing investigation", missingInvestigationReason(ctx, "SIG-001"));
  }
  const indexIds = new Set(ctx.embeddings.chunks.map((c) => c.chunk_id));
  const listed = new Set(output.knowledge_sources.map((k) => k.chunk_id));
  const missingIndex = output.knowledge_sources.filter((k) => !indexIds.has(k.chunk_id));
  const knowledgeClaims = [
    ...output.supporting_evidence,
    ...output.counter_evidence,
  ].filter((e) => e.source.kind === "knowledge");
  const uncited = knowledgeClaims.filter((e) => {
    if (e.source.kind !== "knowledge") return false;
    return !listed.has(e.source.chunk_id);
  });
  const actual = `index_misses=${missingIndex.length} uncited=${uncited.length}`;
  if (missingIndex.length > 0 || uncited.length > 0) {
    return fail(
      "EVAL-09",
      expected,
      actual,
      missingIndex[0]
        ? `chunk not in index: ${missingIndex[0].chunk_id}`
        : "knowledge claim missing from knowledge_sources",
    );
  }
  return pass("EVAL-09", expected, actual, "grounding resolves");
}

export function eval10(ctx: HarnessContext): EvalResult {
  const expected = "SIG-004 MATCHED; primary investigation status === NOT_AN_INCIDENT";
  const match = matchFor(ctx, "SIG-004");
  const primary = primaryCandidate(ctx, "SIG-004");
  const matchedHalf = Boolean(match?.matched && primary);
  const output = investigationForPrimary(ctx, "SIG-004");
  if (!matchedHalf) {
    return fail(
      "EVAL-10",
      expected,
      "SIG-004 not MATCHED",
      "union-coverage match did not MATCH SIG-004",
      { blocking: true },
    );
  }
  if (!output) {
    return fail(
      "EVAL-10",
      expected,
      `MATCHED primary=${primary!.id}; no investigation`,
      missingInvestigationReason(ctx, "SIG-004"),
      { blocking: true },
    );
  }
  const actual = `matched primary=${primary!.id} status=${output.status}`;
  if (output.status !== "NOT_AN_INCIDENT") {
    return fail(
      "EVAL-10",
      expected,
      actual,
      `status is ${output.status}, not NOT_AN_INCIDENT`,
      { blocking: true },
    );
  }
  return pass("EVAL-10", expected, actual, "noise rejected", { blocking: true });
}

export function runAllEvals(ctx: HarnessContext): EvalResult[] {
  return [
    eval01(ctx),
    eval02(ctx),
    eval03(ctx),
    eval04(ctx),
    eval05(ctx),
    eval06(ctx),
    eval07(ctx),
    eval08(ctx),
    eval09(ctx),
    eval10(ctx),
  ];
}
