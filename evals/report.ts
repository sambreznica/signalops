import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NEUTRAL_EVAL_IDS, type EvalResult } from "./types";

export function overallPass(results: EvalResult[]): boolean {
  const eval10 = results.find((r) => r.id === "EVAL-10");
  if (!eval10?.pass) return false;
  return results.every((r) => r.pass);
}

export function formatResults(
  title: string,
  results: EvalResult[],
  extraLines: string[] = [],
): string {
  const lines = [title, ...extraLines, ""];
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    const block = r.blocking ? " [BLOCKING]" : "";
    lines.push(`${r.id}${block}  ${mark}`);
    lines.push(`  expected: ${r.expected}`);
    lines.push(`  actual:   ${r.actual}`);
    lines.push(`  reason:   ${r.reason}`);
    for (const sub of r.subchecks ?? []) {
      lines.push(`  sub ${sub.id}: ${sub.pass ? "PASS" : "FAIL"} — ${sub.reason}`);
    }
    lines.push("");
  }
  const passed = results.filter((r) => r.pass).length;
  const eval10 = results.find((r) => r.id === "EVAL-10");
  const ok = overallPass(results);
  lines.push(`${passed}/${results.length} passed`);
  if (eval10 && !eval10.pass) {
    lines.push("EVAL-10 BLOCKING failed → overall FAIL");
  }
  lines.push(`overall: ${ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

export function writeEvidence(filePath: string, body: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${body}\n`);
}

export const BASELINE_SCOPE = [
  "Scored on EVAL-01, EVAL-02, EVAL-03, EVAL-06, EVAL-07, EVAL-10 only.",
  "EVAL-04, EVAL-05, EVAL-08, EVAL-09 are unpassable for a single-call baseline by construction and are not scored.",
  "Caveat: EVAL-01 is scored on deterministic triage, which the baseline does not replace.",
].join("\n");

export { NEUTRAL_EVAL_IDS };
