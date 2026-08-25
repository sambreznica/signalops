import { cosine } from "../../retrieval";
import type { EmbeddedChunk } from "../../retrieval/types";
import type { FindSimilarIncidentsArgs } from "./args";
import { SIMILAR_INCIDENTS_CAP } from "./caps";
import { asCount } from "./quantity";
import type { ToolErr, ToolOk, ToolRuntime } from "./types";

const INCIDENT_HEADING = /^(INC-\d{4}-\d{3})\b/;
const CLOSED_LOG_DOC = "KD-06";

export const INCIDENT_SELECTION = "top_k_by_max_chunk_cosine" as const;

type ClosedIncident = {
  incident_id: string;
  title: string;
  chunks: EmbeddedChunk[];
};

/**
 * Group KD-06 chunks in document order. A `## INC-…` heading starts an
 * incident; following subsections belong to it until the next heading.
 */
export function groupClosedIncidents(
  chunks: readonly EmbeddedChunk[],
): ClosedIncident[] {
  const ordered = chunks.filter((chunk) => chunk.doc_id === CLOSED_LOG_DOC);
  const groups: ClosedIncident[] = [];
  let current: ClosedIncident | null = null;
  for (const chunk of ordered) {
    const match = INCIDENT_HEADING.exec(chunk.section);
    if (match) {
      current = {
        incident_id: match[1]!,
        title: chunk.section,
        chunks: [chunk],
      };
      groups.push(current);
    } else if (current) {
      current.chunks.push(chunk);
    }
  }
  return groups;
}

function sectionText(chunks: readonly EmbeddedChunk[], section: string): string {
  return chunks
    .filter((chunk) => chunk.section === section)
    .map((chunk) => chunk.text)
    .join("\n");
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

export async function runFindSimilarIncidents(
  args: FindSimilarIncidentsArgs,
  runtime: ToolRuntime,
  call_id: string,
): Promise<ToolOk | ToolErr> {
  const incidents = groupClosedIncidents(runtime.embeddings.chunks);
  const query = await runtime.embedQuery(args.description);

  const scored = incidents.map((incident) => {
    let best = incident.chunks[0]!;
    let bestScore = cosine(query, best.embedding);
    for (let i = 1; i < incident.chunks.length; i++) {
      const chunk = incident.chunks[i]!;
      const score = cosine(query, chunk.embedding);
      if (score > bestScore) {
        bestScore = score;
        best = chunk;
      }
    }
    return { incident, score: bestScore, best_chunk_id: best.chunk_id };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.incident.incident_id < b.incident.incident_id ? -1 : 1;
  });

  const top = scored.slice(0, SIMILAR_INCIDENTS_CAP);

  return {
    ok: true,
    returned: asCount(top.length, "incidents", call_id),
    corpus_size: asCount(incidents.length, "incidents", call_id),
    truncated: top.length < incidents.length,
    selection: INCIDENT_SELECTION,
    incidents: top.map((row) => ({
      incident_id: row.incident.incident_id,
      title: row.incident.title,
      score: row.score,
      chunk_id: row.best_chunk_id,
      resolution: clip(sectionText(row.incident.chunks, "Close"), 800),
      outcome: clip(sectionText(row.incident.chunks, "Lesson"), 800),
    })),
  };
}
