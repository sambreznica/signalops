import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "@huggingface/transformers";
import { chunkMarkdown } from "../src/lib/retrieval/chunk";
import type { EmbeddedChunk, EmbeddingIndex } from "../src/lib/retrieval/types";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DIMS = 384;
const knowledgeDir = path.resolve(process.cwd(), "knowledge");

type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

function toVector(output: unknown): number[] {
  const tensor = output as {
    data?: ArrayLike<number>;
    tolist?: () => unknown;
  };
  if (typeof tensor.tolist === "function") {
    const listed = tensor.tolist();
    const flat = Array.isArray(listed[0])
      ? (listed as number[][]).flat()
      : (listed as number[]);
    if (flat.length === DIMS) return flat;
  }
  if (tensor.data && tensor.data.length === DIMS) {
    return Array.from(tensor.data);
  }
  throw new Error(`unexpected embedding shape from ${MODEL_ID}`);
}

async function main(): Promise<void> {
  const files = readdirSync(knowledgeDir)
    .filter((name) => name.startsWith("KD-") && name.endsWith(".md"))
    .sort();

  const chunks = files.flatMap((name) =>
    chunkMarkdown(name, readFileSync(path.join(knowledgeDir, name), "utf8")),
  );

  console.log(`Chunked ${files.length} documents → ${chunks.length} chunks`);
  const perDoc = new Map<string, number>();
  for (const chunk of chunks) {
    perDoc.set(chunk.doc_id, (perDoc.get(chunk.doc_id) ?? 0) + 1);
  }
  for (const [doc, n] of [...perDoc.entries()].sort()) {
    console.log(`  ${doc}: ${n}`);
  }

  const extractor = (await pipeline("feature-extraction", MODEL_ID, {
    dtype: "fp32",
  })) as unknown as FeatureExtractor;

  const embedded: EmbeddedChunk[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const output = await extractor(chunk.text, {
      pooling: "mean",
      normalize: true,
    });
    const embedding = toVector(output);
    if (embedding.length !== DIMS) {
      throw new Error(`dims ${embedding.length} at ${chunk.chunk_id}`);
    }
    embedded.push({ ...chunk, embedding });
    if ((i + 1) % 25 === 0 || i + 1 === chunks.length) {
      console.log(`  embedded ${i + 1}/${chunks.length}`);
    }
  }

  const index: EmbeddingIndex = {
    model: MODEL_ID,
    dims: DIMS,
    chunks: embedded,
  };

  mkdirSync(knowledgeDir, { recursive: true });
  const outPath = path.join(knowledgeDir, "embeddings.json");
  writeFileSync(outPath, `${JSON.stringify(index)}\n`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
