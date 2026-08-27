import type { ConfidenceBand, RiskClass } from "../schema/investigation";
import type { TicketPriority } from "../schema/ticket";

/**
 * OPERATIONS §4. Computed in code. Granted band, not model_requested.
 * Null granted is treated as LOW (fail closed) and must be named in the rationale.
 */
export function derivePriority(
  riskClass: RiskClass,
  granted: ConfidenceBand | null,
): { priority: TicketPriority; granted_missing: boolean } {
  const band: ConfidenceBand = granted ?? "LOW";
  const granted_missing = granted === null;
  if (riskClass === "PRODUCTION") {
    if (band === "HIGH") return { priority: "P1", granted_missing };
    return { priority: "P2", granted_missing };
  }
  if (riskClass === "EXTERNAL") {
    if (band === "HIGH") return { priority: "P1", granted_missing };
    if (band === "MEDIUM") return { priority: "P2", granted_missing };
    return { priority: "P3", granted_missing };
  }
  if (band === "HIGH") return { priority: "P2", granted_missing };
  if (band === "MEDIUM") return { priority: "P3", granted_missing };
  return { priority: "P4", granted_missing };
}
