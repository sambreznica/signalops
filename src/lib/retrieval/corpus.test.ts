import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "./chunk";
import type { EmbeddingIndex } from "./types";

const root = path.resolve(__dirname, "../../..");
const knowledgeDir = path.join(root, "knowledge");
const retrievalDir = path.resolve(__dirname);

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const BANNED = ["signals.json", "SIG-00", "CLUSTER_TAGS"];

function knowledgeMarkdown(): { filename: string; text: string }[] {
  return readdirSync(knowledgeDir)
    .filter((name) => name.startsWith("KD-") && name.endsWith(".md"))
    .sort()
    .map((name) => ({
      filename: name,
      text: readFileSync(path.join(knowledgeDir, name), "utf8"),
    }));
}

describe("knowledge + retrieval corpus", () => {
  it("does not name live signals in documents or retrieval code", () => {
    const files = [
      ...knowledgeMarkdown().map((d) => path.join(knowledgeDir, d.filename)),
      ...walkTs(retrievalDir),
    ];
    expect(files.length).toBeGreaterThan(6);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of BANNED) {
        expect(source, `${path.basename(file)} contains ${token}`).not.toContain(
          token,
        );
      }
    }
  });

  it("chunks all six documents with KD-02 carrying a 1.4.2 section", () => {
    const docs = knowledgeMarkdown();
    expect(docs.map((d) => d.filename.slice(0, 5))).toEqual([
      "KD-01",
      "KD-02",
      "KD-03",
      "KD-04",
      "KD-05",
      "KD-06",
    ]);
    const chunks = docs.flatMap((d) => chunkMarkdown(d.filename, d.text));
    expect(chunks.length).toBeGreaterThan(0);
    const kd02 = chunks.filter((c) => c.doc_id === "KD-02");
    expect(kd02.some((c) => c.section.includes("1.4.2"))).toBe(true);
    expect(kd02.some((c) => c.section.includes("3.2"))).toBe(true);
    expect(kd02.some((c) => /BLE \(1\.4\.1\)/.test(c.section))).toBe(true);
  });
});

describe("committed embeddings index", () => {
  it("matches the chunker, 384-d, six documents", () => {
    const indexPath = path.join(knowledgeDir, "embeddings.json");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as EmbeddingIndex;
    expect(index.dims).toBe(384);
    expect(index.model).toContain("all-MiniLM-L6-v2");

    const docs = knowledgeMarkdown();
    const expected = docs.flatMap((d) => chunkMarkdown(d.filename, d.text));
    expect(index.chunks).toHaveLength(expected.length);

    const byId = new Map(expected.map((c) => [c.chunk_id, c]));
    const seen = new Set<string>();
    const perDoc = new Map<string, number>();

    for (const chunk of index.chunks) {
      expect(seen.has(chunk.chunk_id)).toBe(false);
      seen.add(chunk.chunk_id);
      const source = byId.get(chunk.chunk_id);
      expect(source).toBeDefined();
      expect(chunk.doc_id).toBe(source?.doc_id);
      expect(chunk.section).toBe(source?.section);
      expect(chunk.text).toBe(source?.text);
      expect(chunk.embedding).toHaveLength(384);
      perDoc.set(chunk.doc_id, (perDoc.get(chunk.doc_id) ?? 0) + 1);
    }

    expect([...perDoc.keys()].sort()).toEqual([
      "KD-01",
      "KD-02",
      "KD-03",
      "KD-04",
      "KD-05",
      "KD-06",
    ]);
  });
});
