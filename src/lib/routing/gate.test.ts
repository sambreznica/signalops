import { describe, expect, it } from "vitest";
import { execute } from "../approval";
import type { RecommendedAction } from "../schema/investigation";

describe("ticket creation sits behind execute", () => {
  it("does not reach routing when PRODUCTION is unapproved", () => {
    const action: RecommendedAction = {
      action_id: "act_3",
      description: "Flag a firmware train as a rollback candidate.",
      risk_class: "PRODUCTION",
    };
    const result = execute(action, { approvals: [] });
    expect(result.ok).toBe(false);
  });
});
