import { cosine } from "./cosine";
import type { EmbeddedChunk, RankedChunk } from "./types";

/**
 * Rank embedded chunks by cosine similarity to a query vector.
 * `score` is attached at query time; it is not stored on the index.
 */
export function rankByCosine(
  query: number[],
  chunks: readonly EmbeddedChunk[],
  k: number,
): RankedChunk[] {
  if (k <= 0) return [];
  const ranked: RankedChunk[] = chunks.map((chunk) => ({
    ...chunk,
    embedding: chunk.embedding,
    score: cosine(query, chunk.embedding),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, k);
}
