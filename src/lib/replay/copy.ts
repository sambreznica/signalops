import type { CeilingRule, EvidenceType, Status } from "../schema/investigation";
import type { StopReason } from "../../../evals/artefact";
import type { DeterministicFinding } from "../schema/investigation";

export function evidenceTypeCopy(kind: EvidenceType): string {
  if (kind === "correlational") return "association, not proven cause";
  if (kind === "causal") return "cause";
  return "documented";
}

export function stopReasonCopy(reason: StopReason | undefined): string {
  if (reason === "validation_exhausted") {
    return "The investigation could not produce a usable write-up";
  }
  if (reason === "wall_clock") return "Ran out of time";
  if (reason === "call_cap") return "Reached its evidence-gathering limit";
  if (reason === "completed") return "Completed";
  return "Completed";
}

export function ceilingCopy(rule: CeilingRule): string {
  if (rule === "correlational_evidence") {
    return "the evidence shows association, not proven cause";
  }
  if (rule === "unrebutted_counter_evidence") {
    return "the critic raised an objection that was not answered";
  }
  return "too few affected devices to be confident";
}

export function statusToneClass(status: Status): string {
  if (status === "NOT_AN_INCIDENT" || status === "CONFIRMED") return "text-settled";
  if (status === "UNCERTAIN") return "text-elevated";
  return "text-graphite";
}

export type HeadlinePair = {
  left: DeterministicFinding;
  right: DeterministicFinding;
  ratio: number;
};

function isRateFinding(f: DeterministicFinding): boolean {
  const u = f.unit.toLowerCase();
  if (u === "ratio" || u === "records" || u === "events" || u === "devices" || u === "users") {
    return false;
  }
  return u.includes("per_") || u.includes("rate") || u.includes("day");
}

/** Largest same-call rate pair — the comparison the verdict should lead with. */
export function headlineComparison(
  findings: readonly DeterministicFinding[],
): HeadlinePair | null {
  const rates = findings.filter(isRateFinding);
  let best: HeadlinePair | null = null;
  for (let i = 0; i < rates.length; i += 1) {
    for (let j = i + 1; j < rates.length; j += 1) {
      const a = rates[i]!;
      const b = rates[j]!;
      if (a.source.kind !== "tool_call" || b.source.kind !== "tool_call") continue;
      if (a.source.call_id !== b.source.call_id) continue;
      if (a.unit !== b.unit) continue;
      if (a.value <= 0 || b.value <= 0) continue;
      const high = a.value >= b.value ? a : b;
      const low = a.value >= b.value ? b : a;
      const ratio = high.value / low.value;
      const candidate = { left: high, right: low, ratio };
      if (!best) {
        best = candidate;
        continue;
      }
      if (high.value > best.left.value) {
        best = candidate;
        continue;
      }
      if (high.value === best.left.value && ratio > best.ratio) {
        best = candidate;
      }
    }
  }
  return best;
}

export function carryFindings(
  findings: readonly DeterministicFinding[],
  pair: HeadlinePair | null,
): DeterministicFinding[] {
  if (!pair) return findings.slice(0, 3);
  const out = [pair.left, pair.right];
  if (pair.left.source.kind !== "tool_call") return out;
  const callId = pair.left.source.call_id;
  const extra = findings.find(
    (f) =>
      f.id !== pair.left.id &&
      f.id !== pair.right.id &&
      f.source.kind === "tool_call" &&
      f.source.call_id === callId &&
      f.unit === "devices",
  );
  if (extra) out.push(extra);
  return out;
}

export function formatMultiplier(ratio: number): string {
  return `${ratio.toFixed(2)}×`;
}

export function altOutcomeCopy(
  status: "weakened" | "open" | "rejected",
): string {
  if (status === "open") return "left open";
  return status;
}

export function needsSignOff(riskClass: "INTERNAL" | "EXTERNAL" | "PRODUCTION"): boolean {
  return riskClass === "EXTERNAL" || riskClass === "PRODUCTION";
}

export function riskClassCopy(
  riskClass: "INTERNAL" | "EXTERNAL" | "PRODUCTION",
): string {
  if (riskClass === "INTERNAL") return "Internal";
  if (riskClass === "EXTERNAL") return "External";
  return "Production";
}
