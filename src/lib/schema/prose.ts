import type { InvestigationOutput, TraceEvent } from "./investigation";

/** `{f_1}`, `{f_2}`, … — the only legal way to state a figure in prose. */
export const FINDING_REF_RE = /\{f_[1-9]\d*\}/g;

export const METRIC_NAMES = [
  "ble_disconnects_24h",
  "session_gap_minutes",
  "adhesion_flag",
  "motion_intensity",
  "skin_temp_delta_c",
  "battery_drain_pct",
  "activity_level",
] as const;

/**
 * Names, not quantities. Widened after EVAL-04b treated metric names and
 * incident/issue ids as bare numerals (eval over-tightness, distinct from
 * the live claim-discipline defect).
 *
 * Order: finding refs, then specific id grammars, then metric names (longest
 * first), then dotted version strings.
 */
export function stripIdentifiers(text: string): string {
  let stripped = text.replace(FINDING_REF_RE, " ");
  stripped = stripped.replace(/\bKD-\d+\b/gi, " ");
  stripped = stripped.replace(/\bINC-\d{4}-\d{3}\b/g, " ");
  stripped = stripped.replace(/\bKI-[A-Z]{2}-\d{3}\b/g, " ");
  const metrics = [...METRIC_NAMES].sort((a, b) => b.length - a.length);
  for (const metric of metrics) {
    stripped = stripped.split(metric).join(" ");
  }
  stripped = stripped.replace(/\b\d+\.\d+(?:\.\d+)?\b/g, " ");
  return stripped;
}

export function hasBareNumeral(text: string): boolean {
  return /\d/.test(stripIdentifiers(text));
}

export function findingRefsIn(text: string): string[] {
  return [...text.matchAll(/\{(f_[1-9]\d*)\}/g)].map((m) => m[1]!);
}

function traceFreeText(event: TraceEvent): string[] {
  if (event.kind === "tool_call") return [event.result_summary];
  if (event.kind === "ceiling_applied") return [];
  return [event.effect, event.detail];
}

export function freeTextFields(output: InvestigationOutput): string[] {
  return [
    output.title,
    output.summary,
    output.leading_hypothesis.statement,
    ...output.alternative_hypotheses.flatMap((h) => [
      h.statement,
      h.falsifying_test,
    ]),
    ...output.deterministic_findings.map((f) => f.label),
    ...output.supporting_evidence.map((e) => e.claim),
    ...output.counter_evidence.map((e) => e.claim),
    ...output.recommended_actions.map((a) => a.description),
    ...output.uncertainty,
    ...output.trace.flatMap(traceFreeText),
  ];
}

export function bareNumeralHits(output: InvestigationOutput): string[] {
  return freeTextFields(output).filter(hasBareNumeral);
}

export function orphanFindingRefs(output: InvestigationOutput): string[] {
  const ids = new Set(output.deterministic_findings.map((f) => f.id));
  const orphans: string[] = [];
  for (const text of freeTextFields(output)) {
    for (const id of findingRefsIn(text)) {
      if (!ids.has(id)) orphans.push(id);
    }
  }
  return [...new Set(orphans)];
}

export function duplicateFindingIds(output: InvestigationOutput): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const finding of output.deterministic_findings) {
    if (seen.has(finding.id)) dupes.push(finding.id);
    seen.add(finding.id);
  }
  return dupes;
}

export function claimDisciplineErrors(output: InvestigationOutput): string[] {
  const errors: string[] = [];
  for (const id of duplicateFindingIds(output)) {
    errors.push(`duplicate finding id ${id}`);
  }
  for (const id of orphanFindingRefs(output)) {
    errors.push(`orphan finding {${id}}`);
  }
  if (bareNumeralHits(output).length > 0) {
    errors.push("bare numeral in free text");
  }
  return errors;
}

/** Display-time substitution. Does not invent a value for a missing id. */
export function renderFindingRefs(
  text: string,
  findings: readonly { id: string; value: number; unit: string }[],
): string {
  const byId = new Map(findings.map((f) => [f.id, f]));
  return text.replace(FINDING_REF_RE, (token) => {
    const id = token.slice(1, -1);
    const finding = byId.get(id);
    if (!finding) return token;
    return `${finding.value} ${finding.unit}`;
  });
}
