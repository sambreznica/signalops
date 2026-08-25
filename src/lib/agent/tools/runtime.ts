import { readFileSync } from "node:fs";
import path from "node:path";
import type { FeedbackRecord, TagTaxonomyEntry, TelemetryRecord } from "../../fixtures/types";
import type { EmbeddingIndex } from "../../retrieval/types";
import type { ToolRuntime } from "./types";

function loadJson<T>(root: string, rel: string): T {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;
}

/** File-backed runtime. Query encoding is injected — not loaded here. */
export function loadStaticRuntime(
  root: string,
  embedQuery: (text: string) => Promise<number[]>,
): ToolRuntime {
  return {
    telemetry: loadJson<TelemetryRecord[]>(root, "synthetic-data/telemetry.json"),
    feedback: loadJson<FeedbackRecord[]>(root, "synthetic-data/feedback.json"),
    taxonomy: loadJson<TagTaxonomyEntry[]>(
      root,
      "synthetic-data/tag-taxonomy.json",
    ),
    embeddings: loadJson<EmbeddingIndex>(root, "knowledge/embeddings.json"),
    embedQuery,
  };
}
