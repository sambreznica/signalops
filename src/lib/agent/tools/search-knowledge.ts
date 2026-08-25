import { rankByCosine } from "../../retrieval";
import type { SearchKnowledgeArgs } from "./args";
import {
  KNOWLEDGE_K_DEFAULT,
  KNOWLEDGE_K_MAX,
  KNOWLEDGE_K_MIN,
} from "./caps";
import { asCount } from "./quantity";
import type { ToolErr, ToolOk, ToolRuntime } from "./types";

function clampK(k: number | undefined): number {
  const requested = k ?? KNOWLEDGE_K_DEFAULT;
  return Math.min(KNOWLEDGE_K_MAX, Math.max(KNOWLEDGE_K_MIN, requested));
}

export async function runSearchKnowledge(
  args: SearchKnowledgeArgs,
  runtime: ToolRuntime,
  call_id: string,
): Promise<ToolOk | ToolErr> {
  const k_resolved = clampK(args.k);
  const pool =
    args.doc_id === undefined
      ? runtime.embeddings.chunks
      : runtime.embeddings.chunks.filter(
          (chunk) => chunk.doc_id === args.doc_id,
        );

  const query = await runtime.embedQuery(args.query);
  const ranked = rankByCosine(query, pool, k_resolved);

  return {
    ok: true,
    k_resolved: asCount(k_resolved, "chunks", call_id),
    n_corpus: asCount(pool.length, "chunks", call_id),
    returned: asCount(ranked.length, "chunks", call_id),
    chunks: ranked.map((chunk) => ({
      doc_id: chunk.doc_id,
      title: chunk.title,
      section: chunk.section,
      chunk_id: chunk.chunk_id,
      score: chunk.score,
      text: chunk.text,
    })),
  };
}
