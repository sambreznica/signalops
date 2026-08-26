import { FINDING_REF_RE } from "../schema/prose";
import type { DeterministicFinding } from "../schema/investigation";

export type FindingSegment =
  | { kind: "text"; text: string }
  | {
      kind: "resolved";
      id: string;
      value: number;
      unit: string;
      callId: string | null;
    }
  | { kind: "unresolved"; id: string };

/**
 * Split prose on `{f_n}` the same way `renderFindingRefs` scans.
 * Unresolved tokens stay in the sentence as their own segment — never dropped.
 */
export function splitFindingText(
  text: string,
  findings: readonly DeterministicFinding[],
): FindingSegment[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const segments: FindingSegment[] = [];
  let last = 0;
  const re = new RegExp(FINDING_REF_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({ kind: "text", text: text.slice(last, start) });
    }
    const id = match[0].slice(1, -1);
    const finding = byId.get(id);
    if (!finding) {
      segments.push({ kind: "unresolved", id });
    } else {
      segments.push({
        kind: "resolved",
        id,
        value: finding.value,
        unit: finding.unit,
        callId:
          finding.source.kind === "tool_call" ? finding.source.call_id : null,
      });
    }
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", text: text.slice(last) });
  }
  return segments;
}
