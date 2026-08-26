import { describe, expect, it } from "vitest";
import { deltaTone, histogramBins, SEVERITY_HIST_EDGES } from "./viz";

describe("deltaTone", () => {
  it("marks a large HIGH ratio as critical and a sub-1 LOW ratio as settled", () => {
    expect(deltaTone(6.841, "HIGH")).toBe("critical");
    expect(deltaTone(0.9791, "LOW")).toBe("settled");
  });
});

describe("histogramBins", () => {
  it("places 0.45 and 0.9 on the documented cut edges", () => {
    expect(SEVERITY_HIST_EDGES).toContain(0.45);
    expect(SEVERITY_HIST_EDGES).toContain(0.9);
    const counts = histogramBins([0.1, 0.45, 0.9, 1.4], SEVERITY_HIST_EDGES);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
