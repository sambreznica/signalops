import { describe, expect, it } from "vitest";
import { loadHarnessContext, loadRunById } from "./load";

describe("certification artefact selection", () => {
  it("scores the newest agent run, never a baseline artefact", () => {
    const ctx = loadHarnessContext();
    expect(ctx.run).not.toBeNull();
    expect(ctx.run?.kind).toBe("agent");
    expect(ctx.run?.run_id).not.toBe("run-baseline");
    const board = loadRunById("run-board-1");
    expect(board?.kind).toBe("agent");
    const baseline = loadRunById("run-baseline");
    expect(baseline?.kind).toBe("baseline");
    expect(baseline?.investigations).toHaveLength(4);
    expect(
      baseline?.investigations.every(
        (row) => row.output.trace.length === 0 && row.metrics.tool_calls === 0,
      ),
    ).toBe(true);
  });
});
