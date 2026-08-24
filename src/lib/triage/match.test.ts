import { describe, expect, it } from "vitest";
import {
  deviceCoverage,
  deviceJaccard,
  devicePrecision,
  unionCoverageMatch,
} from "./match";

describe("union coverage matching", () => {
  it("treats a candidate as eligible when it is majority-about the signal", () => {
    const signal = ["a", "b", "c", "d"];
    const majority = ["a", "b", "c", "x"];
    const incidental = ["a", "w", "x", "y", "z"];
    expect(devicePrecision(majority, signal)).toBe(0.75);
    expect(devicePrecision(incidental, signal)).toBe(0.2);
  });

  it("matches a fragmented signal by union coverage and names the primary", () => {
    const matches = unionCoverageMatch(
      [
        { id: "battery", device_ids: ["a", "b", "c", "d", "x"] },
        { id: "heat", device_ids: ["c", "d", "e"] },
        { id: "ui", device_ids: ["e", "f"] },
        { id: "unrelated", device_ids: ["a", "p", "q", "r", "s"] },
      ],
      [{ id: "noise", device_ids: ["a", "b", "c", "d", "e", "f"] }],
    );
    expect(matches).toHaveLength(1);
    const row = matches[0]!;
    expect(row.matched).toBe(true);
    expect(row.union_coverage).toBe(1);
    expect(row.match_set.map((m) => m.candidate_id).sort()).toEqual([
      "battery",
      "heat",
      "ui",
    ]);
    expect(row.primary?.candidate_id).toBe("battery");
    expect(row.primary?.coverage).toBeCloseTo(4 / 6);
    expect(row.match_set.some((m) => m.candidate_id === "unrelated")).toBe(
      false,
    );
  });

  it("does not match when eligible candidates cannot cover the signal", () => {
    const matches = unionCoverageMatch(
      [{ id: "sparse", device_ids: ["a", "x"] }],
      [{ id: "ref", device_ids: ["a", "b", "c", "d", "e"] }],
    );
    expect(matches[0]?.matched).toBe(false);
    expect(matches[0]?.union_coverage).toBe(0.2);
    expect(matches[0]?.primary?.candidate_id).toBe("sparse");
  });

  it("prefers higher Jaccard when two candidates cover the same share", () => {
    const sidecar = ["a", "b", "c", "d"];
    expect(deviceCoverage(["a", "b", "c", "d"], sidecar)).toBe(1);
    expect(deviceJaccard(["a", "b", "c", "d", "e"], sidecar)).toBeLessThan(1);
    const matches = unionCoverageMatch(
      [
        { id: "broad", device_ids: ["a", "b", "c", "d", "e"] },
        { id: "tight", device_ids: ["a", "b", "c", "d"] },
      ],
      [{ id: "ref", device_ids: sidecar }],
    );
    expect(matches[0]?.primary?.candidate_id).toBe("tight");
    expect(matches[0]?.primary?.jaccard).toBe(1);
  });
});
