import type { SeverityBand } from "../triage/types";

export type ExceptionTone = "critical" | "elevated" | "settled" | "inert";

/** Rate-delta exception: HIGH / large ratios look abnormal; ~1 does not. */
export function deltaTone(
  ratio: number | null,
  band: SeverityBand,
): ExceptionTone {
  if (ratio === null) return "inert";
  if (band === "HIGH" || ratio >= 2) return "critical";
  if (band === "MEDIUM" || ratio > 1) return "elevated";
  if (ratio < 1) return "settled";
  return "inert";
}

export function histogramBins(
  values: readonly number[],
  edges: readonly number[],
): number[] {
  const counts = Array.from({ length: edges.length - 1 }, () => 0);
  for (const v of values) {
    for (let i = 0; i < edges.length - 1; i += 1) {
      const lo = edges[i]!;
      const hi = edges[i + 1]!;
      const last = i === edges.length - 2;
      if (v >= lo && (last ? v <= hi : v < hi)) {
        counts[i] += 1;
        break;
      }
    }
  }
  return counts;
}

export const SEVERITY_HIST_EDGES = [
  0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.5, 2,
] as const;
