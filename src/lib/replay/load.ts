import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { runAllEvals } from "../../../evals/assertions";
import {
  certificationRunSchema,
  type CertificationRun,
  type InvestigationRecord,
} from "../../../evals/artefact";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../fixtures/constants";
import type {
  FeedbackRecord,
  SignalGroundTruth,
  SignalsSidecar,
  TagTaxonomyEntry,
  TelemetryRecord,
} from "../fixtures/types";
import type { Chunk, EmbeddingIndex } from "../retrieval/types";
import { unionCoverageMatch } from "../triage/match";
import { runTriage } from "../triage/run";
import type { TriageCandidate } from "../triage/types";
import {
  EMBEDDINGS_PATH,
  FEEDBACK_PATH,
  RUNS_DIR,
  SIGNALS_SIDECAR,
  TAXONOMY_PATH,
  TELEMETRY_PATH,
} from "../../../evals/paths";
import type { EvalResult } from "../../../evals/types";
import type { HarnessContext } from "../../../evals/load";
import { DEFAULT_RUN_ID } from "./constants";
import { migrateTicketRecord } from "../tickets/migrate";
import {
  ticketsArtefactSchema,
  type TicketsArtefact,
} from "../schema/ticket";

export { DEFAULT_CANDIDATE_ID, DEFAULT_RUN_ID } from "./constants";

const SKIP_RUN_FILES = new Set(["tool-cache.json"]);

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function replayRunId(): string {
  return process.env.SIGNALOPS_RUN_ID ?? DEFAULT_RUN_ID;
}

export function runFilePath(runId: string): string {
  const base = path.basename(runId);
  if (base !== runId || base.includes("..")) {
    throw new Error(`invalid run id: ${runId}`);
  }
  return path.join(RUNS_DIR, `${base}.json`);
}

export function ticketsArtefactPath(runId: string): string {
  const base = path.basename(runId);
  if (base !== runId || base.includes("..")) {
    throw new Error(`invalid run id: ${runId}`);
  }
  return path.join(RUNS_DIR, `${base}.tickets.json`);
}

export function loadTicketsArtefact(runId: string): TicketsArtefact | null {
  const file = ticketsArtefactPath(runId);
  if (!existsSync(file)) return null;
  const raw = readJson<TicketsArtefact & { tickets: unknown[] }>(file);
  const parsed = ticketsArtefactSchema.safeParse({
    ...raw,
    tickets: Array.isArray(raw.tickets)
      ? raw.tickets.map((row) => migrateTicketRecord(row))
      : raw.tickets,
  });
  return parsed.success ? parsed.data : null;
}

export function loadReplayRun(runId: string = replayRunId()): CertificationRun {
  const file = runFilePath(runId);
  if (!existsSync(file)) {
    throw new Error(`replay artefact missing: ${file}`);
  }
  const parsed = certificationRunSchema.safeParse(readJson(file));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? "invalid";
    throw new Error(`replay artefact failed schema (${runId}): ${issue}`);
  }
  return parsed.data;
}

export function loadAgentRuns(): CertificationRun[] {
  if (!existsSync(RUNS_DIR)) return [];
  const files = readdirSync(RUNS_DIR)
    .filter(
      (name) =>
        name.endsWith(".json") &&
        !SKIP_RUN_FILES.has(name) &&
        !name.endsWith(".tickets.json"),
    )
    .map((name) => path.join(RUNS_DIR, name))
    .filter((file) => statSync(file).isFile());

  const runs: CertificationRun[] = [];
  for (const file of files) {
    const parsed = certificationRunSchema.safeParse(readJson(file));
    if (!parsed.success) continue;
    if (parsed.data.kind !== "agent") continue;
    runs.push(parsed.data);
  }
  return runs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function loadTriageCandidates(): TriageCandidate[] {
  const telemetry = readJson<TelemetryRecord[]>(TELEMETRY_PATH);
  const feedback = readJson<FeedbackRecord[]>(FEEDBACK_PATH);
  const taxonomy = readJson<TagTaxonomyEntry[]>(TAXONOMY_PATH);
  return runTriage({
    telemetry,
    feedback,
    taxonomy,
    current: { start: CURRENT_WINDOW_START, end: CURRENT_WINDOW_END },
    prior: { start: PRIOR_WINDOW_START, end: PRIOR_WINDOW_END },
  });
}

export type KnowledgeDoc = {
  doc_id: string;
  title: string;
  chunk_count: number;
  chunks: Chunk[];
};

function loadChunks(): Chunk[] {
  const index = readJson<EmbeddingIndex>(EMBEDDINGS_PATH);
  return index.chunks.map((c) => ({
    chunk_id: c.chunk_id,
    doc_id: c.doc_id,
    title: c.title,
    section: c.section,
    text: c.text,
  }));
}

export function loadKnowledgeDocs(): KnowledgeDoc[] {
  const chunks = loadChunks();
  const byDoc = new Map<string, KnowledgeDoc>();
  for (const chunk of chunks) {
    const existing = byDoc.get(chunk.doc_id);
    if (existing) {
      existing.chunks.push(chunk);
      existing.chunk_count += 1;
    } else {
      byDoc.set(chunk.doc_id, {
        doc_id: chunk.doc_id,
        title: chunk.title,
        chunk_count: 1,
        chunks: [chunk],
      });
    }
  }
  return [...byDoc.values()].sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}

export function loadChunkTextById(): Map<string, Chunk> {
  return new Map(loadChunks().map((c) => [c.chunk_id, c]));
}

function loadHarnessBase(): Omit<HarnessContext, "run" | "runError"> {
  const sidecarFile = readJson<SignalsSidecar>(SIGNALS_SIDECAR);
  const sidecar = sidecarFile.signals;
  const candidates = loadTriageCandidates();
  const embeddingsRaw = readJson<EmbeddingIndex>(EMBEDDINGS_PATH);
  const embeddings: EmbeddingIndex = {
    model: embeddingsRaw.model,
    dims: embeddingsRaw.dims,
    chunks: embeddingsRaw.chunks.map((c) => ({
      chunk_id: c.chunk_id,
      doc_id: c.doc_id,
      title: c.title,
      section: c.section,
      text: c.text,
      embedding: [],
    })),
  };
  const matches = unionCoverageMatch(
    candidates.map((c) => ({ id: c.id, device_ids: c.device_ids })),
    sidecar.map((s: SignalGroundTruth) => ({ id: s.id, device_ids: s.device_ids })),
  );
  return { sidecar, candidates, matches, embeddings };
}

export type ScoredAgentRun = {
  run: CertificationRun;
  results: EvalResult[];
};

export function scoreAgentRuns(runs: CertificationRun[] = loadAgentRuns()): ScoredAgentRun[] {
  const base = loadHarnessBase();
  return runs.map((run) => ({
    run,
    results: runAllEvals({ ...base, run, runError: null }),
  }));
}

export function recordForCandidate(
  run: CertificationRun,
  candidateId: string,
): InvestigationRecord | undefined {
  return run.investigations.find((row) => row.candidate_id === candidateId);
}
