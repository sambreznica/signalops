import { describe, expect, it } from "vitest";
import type { RecommendedAction } from "../schema/investigation";
import { execute, requiresApproval, simulatedOutcome } from "./index";

const internal: RecommendedAction = {
  action_id: "act_1",
  description: "Open an engineering investigation",
  risk_class: "INTERNAL",
};

const production: RecommendedAction = {
  action_id: "act_3",
  description: "Flag firmware 1.4.2 as a rollback candidate",
  risk_class: "PRODUCTION",
};

const external: RecommendedAction = {
  action_id: "act_ext",
  description: "Notify affected users",
  risk_class: "EXTERNAL",
};

describe("approval boundary", () => {
  it("derives requiresApproval from risk_class, not a model flag", () => {
    expect(requiresApproval("INTERNAL")).toBe(false);
    expect(requiresApproval("EXTERNAL")).toBe(true);
    expect(requiresApproval("PRODUCTION")).toBe(true);
  });

  it("executes INTERNAL without an approval record", () => {
    const result = execute(internal, {
      approvals: [],
      at: "2026-05-18T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.outcome).toBe("Engineering investigation created");
    expect(result.record.action_id).toBe("act_1");
    expect(result.record.at).toBe("2026-05-18T12:00:00.000Z");
  });

  it("refuses PRODUCTION and EXTERNAL without a matching approval", () => {
    expect(execute(production, { approvals: [] })).toEqual({
      ok: false,
      reason: "approval_required",
    });
    expect(
      execute(external, {
        approvals: [{ action_id: "someone_else", at: "2026-05-18T12:00:00.000Z" }],
      }),
    ).toEqual({ ok: false, reason: "approval_required" });
  });

  it("executes PRODUCTION once a matching approval is present", () => {
    const at = "2026-05-18T12:00:00.000Z";
    const result = execute(production, {
      approvals: [{ action_id: "act_3", at }],
      at,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.outcome).toBe(simulatedOutcome(production));
    expect(result.record.action_id).toBe("act_3");
  });
});
