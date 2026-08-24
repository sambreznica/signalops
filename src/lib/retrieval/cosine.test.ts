import { describe, expect, it } from "vitest";
import { cosine, l2Normalize } from "./cosine";
import { rankByCosine } from "./rank";
import type { EmbeddedChunk } from "./types";

describe("cosine", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosine([1, 2], [-1, -2])).toBeCloseTo(-1, 10);
  });

  it("does not require pre-normalised inputs", () => {
    expect(cosine([3, 0], [9, 0])).toBeCloseTo(1, 10);
    expect(cosine([2, 0], [0, 5])).toBeCloseTo(0, 10);
  });

  it("returns 0 when either vector is zero", () => {
    expect(cosine([0, 0], [1, 2])).toBe(0);
    expect(cosine([1, 2], [0, 0])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosine([1], [1, 2])).toThrow(/length mismatch/);
  });
});

describe("l2Normalize", () => {
  it("produces unit length", () => {
    const n = l2Normalize([3, 4]);
    expect(n[0]).toBeCloseTo(0.6, 10);
    expect(n[1]).toBeCloseTo(0.8, 10);
  });

  it("leaves a zero vector unchanged", () => {
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("rankByCosine", () => {
  const chunks: EmbeddedChunk[] = [
    {
      chunk_id: "KD-00#a#1",
      doc_id: "KD-00",
      title: "T",
      section: "A",
      text: "A",
      embedding: [1, 0],
    },
    {
      chunk_id: "KD-00#b#1",
      doc_id: "KD-00",
      title: "T",
      section: "B",
      text: "B",
      embedding: [0.6, 0.8],
    },
    {
      chunk_id: "KD-00#c#1",
      doc_id: "KD-00",
      title: "T",
      section: "C",
      text: "C",
      embedding: [0, 1],
    },
  ];

  it("returns top-k by descending score without storing score on the input", () => {
    const ranked = rankByCosine([1, 0], chunks, 2);
    expect(ranked.map((c) => c.chunk_id)).toEqual(["KD-00#a#1", "KD-00#b#1"]);
    expect(ranked[0].score).toBeCloseTo(1, 10);
    expect(ranked[1].score).toBeGreaterThan(0);
    expect(ranked[1].score).toBeLessThan(1);
    expect("score" in chunks[0]).toBe(false);
  });

  it("returns an empty list when k is not positive", () => {
    expect(rankByCosine([1, 0], chunks, 0)).toEqual([]);
  });
});
