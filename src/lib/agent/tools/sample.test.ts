import { describe, expect, it } from "vitest";
import { evenlySpaced, evenlySpacedIndices } from "./sample";

describe("evenlySpaced", () => {
  it("returns every index when the set is smaller than the cap", () => {
    expect(evenlySpacedIndices(4, 5)).toEqual([0, 1, 2, 3]);
    expect(evenlySpaced(["a", "b", "c"], 5)).toEqual(["a", "b", "c"]);
  });

  it("spans first to last rather than taking a prefix", () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    expect(evenlySpaced(items, 5)).toEqual([0, 2, 5, 7, 10]);
  });

  it("is deterministic", () => {
    const items = ["t0", "t1", "t2", "t3", "t4", "t5", "t6"];
    expect(evenlySpaced(items, 3)).toEqual(evenlySpaced(items, 3));
    expect(evenlySpaced(items, 3)).toEqual(["t0", "t3", "t6"]);
  });
});
