import type { RecommendedAction, RiskClass } from "../schema/investigation";

export type ApprovalRecord = {
  action_id: string;
  at: string;
};

export type ExecutionRecord = {
  action_id: string;
  at: string;
  outcome: string;
};

export type ExecuteResult =
  | { ok: true; record: ExecutionRecord }
  | { ok: false; reason: "approval_required" };

/** Derived in code. The model does not self-certify the gate. */
export function requiresApproval(riskClass: RiskClass): boolean {
  return riskClass === "EXTERNAL" || riskClass === "PRODUCTION";
}

export function simulatedOutcome(action: RecommendedAction): string {
  if (action.risk_class === "INTERNAL") return "Engineering investigation created";
  if (action.risk_class === "EXTERNAL") return "External notification queued";
  return "Production change queued";
}

/**
 * Execution boundary. EXTERNAL and PRODUCTION cannot produce a log
 * entry without a matching approvals record. INTERNAL has no gate.
 */
export function execute(
  action: RecommendedAction,
  opts: {
    approvals: readonly ApprovalRecord[];
    at?: string;
  },
): ExecuteResult {
  if (requiresApproval(action.risk_class)) {
    const approved = opts.approvals.some((a) => a.action_id === action.action_id);
    if (!approved) return { ok: false, reason: "approval_required" };
  }
  const at = opts.at ?? new Date().toISOString();
  return {
    ok: true,
    record: {
      action_id: action.action_id,
      at,
      outcome: simulatedOutcome(action),
    },
  };
}
