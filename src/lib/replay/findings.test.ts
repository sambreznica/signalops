import { describe, expect, it } from "vitest";
import { splitFindingText } from "./findings";
import type { DeterministicFinding } from "../schema/investigation";

const findings: DeterministicFinding[] = [
  {
    id: "f_1",
    label: "rate",
    value: 2.4,
    unit: "events_per_device_day",
    source: { kind: "tool_call", call_id: "tc_3" },
  },
];

describe("splitFindingText", () => {
  it("substitutes a known finding as a resolved segment with its call_id", () => {
    const segments = splitFindingText("rate is {f_1} in the window", findings);
    expect(segments).toEqual([
      { kind: "text", text: "rate is " },
      {
        kind: "resolved",
        id: "f_1",
        value: 2.4,
        unit: "events_per_device_day",
        callId: "tc_3",
      },
      { kind: "text", text: " in the window" },
    ]);
  });

  it("keeps an unresolved {f_n} as a visible segment instead of dropping the clause", () => {
    const segments = splitFindingText("cohort {f_9} remains", findings);
    expect(segments).toEqual([
      { kind: "text", text: "cohort " },
      { kind: "unresolved", id: "f_9" },
      { kind: "text", text: " remains" },
    ]);
    const reconstructed = segments
      .map((s) => (s.kind === "text" ? s.text : `{${s.id}}`))
      .join("");
    expect(reconstructed).toBe("cohort {f_9} remains");
  });
});
