import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Sidecar the harness is allowed to read. Production analytics/triage must not. */
export const SIGNALS_SIDECAR = path.join(ROOT, "synthetic-data", "signals.json");

export const TELEMETRY_PATH = path.join(ROOT, "synthetic-data", "telemetry.json");
export const FEEDBACK_PATH = path.join(ROOT, "synthetic-data", "feedback.json");
export const TAXONOMY_PATH = path.join(ROOT, "synthetic-data", "tag-taxonomy.json");
export const EMBEDDINGS_PATH = path.join(ROOT, "knowledge", "embeddings.json");
export const RUNS_DIR = path.join(ROOT, "runs");
export const EVIDENCE_PATH = path.join(ROOT, "evidence", "eval-results.md");
export const APPROVAL_MODULE_DIR = path.join(ROOT, "src", "lib", "approval");
export const KD05_PATH = path.join(ROOT, "knowledge", "KD-05-wellness-claims-policy.md");
