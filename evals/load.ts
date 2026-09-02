import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../src/lib/fixtures/constants";
import type {
  FeedbackRecord,
  SignalGroundTruth,
  SignalsSidecar,
  TagTaxonomyEntry,
  TelemetryRecord,
} from "../src/lib/fixtures/types";
import type { EmbeddingIndex } from "../src/lib/retrieval/types";
import type { InvestigationOutput } from "../src/lib/schema/investigation";
import { unionCoverageMatch } from "../src/lib/triage/match";
import { runTriage } from "../src/lib/triage/run";
import type { TriageCandidate, UnionMatch } from "../src/lib/triage/types";
import { certificationRunSchema, type CertificationRun } from "./artefact";
import {
  EMBEDDINGS_PATH,
  FEEDBACK_PATH,
  RUNS_DIR,
  SIGNALS_SIDECAR,
  TAXONOMY_PATH,
  TELEMETRY_PATH,
} from "./paths";

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export type HarnessContext = {
  sidecar: SignalGroundTruth[];
  candidates: TriageCandidate[];
  matches: UnionMatch[];
  embeddings: EmbeddingIndex;
  run: CertificationRun | null;
  runError: string | null;
};

export function loadHarnessContext(): HarnessContext {
  const sidecarFile = readJson<SignalsSidecar>(SIGNALS_SIDECAR);
  const sidecar = sidecarFile.signals;
  const telemetry = readJson<TelemetryRecord[]>(TELEMETRY_PATH);
  const feedback = readJson<FeedbackRecord[]>(FEEDBACK_PATH);
  const taxonomy = readJson<TagTaxonomyEntry[]>(TAXONOMY_PATH);
  const embeddings = readJson<EmbeddingIndex>(EMBEDDINGS_PATH);

  const candidates = runTriage({
    telemetry,
    feedback,
    taxonomy,
    current: { start: CURRENT_WINDOW_START, end: CURRENT_WINDOW_END },
    prior: { start: PRIOR_WINDOW_START, end: PRIOR_WINDOW_END },
  });

  const matches = unionCoverageMatch(
    candidates.map((c) => ({ id: c.id, device_ids: c.device_ids })),
    sidecar.map((s) => ({ id: s.id, device_ids: s.device_ids })),
  );

  const loaded = loadNewestRun();
  return {
    sidecar,
    candidates,
    matches,
    embeddings,
    run: loaded.run,
    runError: loaded.error,
  };
}

function loadNewestRun(): { run: CertificationRun | null; error: string | null } {
  if (!existsSync(RUNS_DIR)) {
    return { run: null, error: "runs/ directory is absent" };
  }
  const files = readdirSync(RUNS_DIR)
    .filter(
      (name) =>
        name.endsWith(".json") &&
        name !== "tool-cache.json" &&
        !name.endsWith(".tickets.json"),
    )
    .map((name) => path.join(RUNS_DIR, name))
    .filter((file) => statSync(file).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  const specified = process.env.RUN_ID
    ? files.find((file) => path.basename(file, ".json") === process.env.RUN_ID)
    : files.find((file) => {
        const parsed = certificationRunSchema.safeParse(readJson(file));
        return parsed.success && parsed.data.kind === "agent";
      });

  if (!specified) {
    return { run: null, error: "no certification JSON in runs/" };
  }

  const parsed = certificationRunSchema.safeParse(readJson(specified));
  if (!parsed.success) {
    return {
      run: null,
      error: `runs artefact failed schema: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    };
  }
  return { run: parsed.data, error: null };
}

export function loadRunById(runId: string): CertificationRun | null {
  const file = path.join(RUNS_DIR, `${runId}.json`);
  if (!existsSync(file)) return null;
  const parsed = certificationRunSchema.safeParse(readJson(file));
  return parsed.success ? parsed.data : null;
}

export function sidecarSignal(
  ctx: HarnessContext,
  id: SignalGroundTruth["id"],
): SignalGroundTruth | undefined {
  return ctx.sidecar.find((s) => s.id === id);
}

export function matchFor(
  ctx: HarnessContext,
  id: SignalGroundTruth["id"],
): UnionMatch | undefined {
  return ctx.matches.find((m) => m.reference_id === id);
}

export function primaryCandidate(
  ctx: HarnessContext,
  id: SignalGroundTruth["id"],
): TriageCandidate | undefined {
  const match = matchFor(ctx, id);
  const primaryId = match?.primary?.candidate_id;
  if (!primaryId) return undefined;
  return ctx.candidates.find((c) => c.id === primaryId);
}

export function investigationForPrimary(
  ctx: HarnessContext,
  id: SignalGroundTruth["id"],
): InvestigationOutput | null {
  const primary = primaryCandidate(ctx, id);
  if (!primary || !ctx.run) return null;
  return (
    ctx.run.investigations.find((row) => row.candidate_id === primary.id)?.output ??
    null
  );
}

export function recordForPrimary(
  ctx: HarnessContext,
  id: SignalGroundTruth["id"],
) {
  const primary = primaryCandidate(ctx, id);
  if (!primary || !ctx.run) return null;
  return ctx.run.investigations.find((row) => row.candidate_id === primary.id) ?? null;
}

export function missingInvestigationReason(
  ctx: HarnessContext,
  id: SignalGroundTruth["id"],
): string {
  if (!ctx.run) {
    return ctx.runError ?? "no certification run artefact";
  }
  const match = matchFor(ctx, id);
  if (!match?.matched || !match.primary) {
    return `${id} is not MATCHED in triage; no primary to investigate`;
  }
  return `no investigation artefact for primary ${match.primary.candidate_id} (${id})`;
}
