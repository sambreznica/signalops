import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { breakdown, rateInWindow } from "../src/lib/analytics";
import type { TelemetryMetric } from "../src/lib/analytics/types";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  APP_VERSIONS,
  FIRMWARE_VERSIONS,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../src/lib/fixtures/constants";
import type { FeedbackRecord, TelemetryRecord } from "../src/lib/fixtures/types";
import type { EmbeddingIndex } from "../src/lib/retrieval/types";
import {
  EMBEDDINGS_PATH,
  FEEDBACK_PATH,
  ROOT,
  TELEMETRY_PATH,
} from "./paths";

const METRICS: TelemetryMetric[] = [
  "ble_disconnects_24h",
  "session_gap_minutes",
  "adhesion_flag",
  "battery_drain_pct",
  "skin_temp_delta_c",
];

const CURRENT = { start: CURRENT_WINDOW_START, end: CURRENT_WINDOW_END };
const PRIOR = { start: PRIOR_WINDOW_START, end: PRIOR_WINDOW_END };

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4);
}

function sliceTable(
  telemetry: readonly TelemetryRecord[],
  metric: TelemetryMetric,
  dimension: "firmware_version" | "app_version" | "region",
  window: { start: string; end: string },
): string {
  const rows = breakdown(telemetry, metric, dimension, { window });
  return rows
    .map(
      (r) =>
        `  ${r.key}: rate=${fmt(r.rate.value)} ${r.rate.unit} devices=${r.n_devices} device_days=${r.device_days}`,
    )
    .join("\n");
}

/** Aggregates + feedback + corpus. No triage ranking, no sidecar labels, no tools. */
export function buildBaselinePack(): string {
  const telemetry = readJson<TelemetryRecord[]>(TELEMETRY_PATH);
  const feedback = readJson<FeedbackRecord[]>(FEEDBACK_PATH);
  const embeddings = readJson<EmbeddingIndex>(EMBEDDINGS_PATH);
  const lines: string[] = [];

  lines.push("Windows");
  lines.push(`current: ${CURRENT_WINDOW_START} .. ${CURRENT_WINDOW_END}`);
  lines.push(`prior: ${PRIOR_WINDOW_START} .. ${PRIOR_WINDOW_END}`);
  lines.push("");

  lines.push("Telemetry aggregates (code). Rates are per device-day.");
  for (const metric of METRICS) {
    lines.push(`# ${metric}`);
    lines.push("current by firmware");
    lines.push(sliceTable(telemetry, metric, "firmware_version", CURRENT));
    lines.push("prior by firmware");
    lines.push(sliceTable(telemetry, metric, "firmware_version", PRIOR));
    lines.push("current by app_version");
    lines.push(sliceTable(telemetry, metric, "app_version", CURRENT));
    lines.push("current by region");
    lines.push(sliceTable(telemetry, metric, "region", CURRENT));
    const overall = rateInWindow(telemetry, metric, { window: CURRENT });
    const prior = rateInWindow(telemetry, metric, { window: PRIOR });
    lines.push(
      `fleet current rate=${fmt(overall.rate.value)} devices=${overall.n_devices}; prior rate=${fmt(prior.rate.value)} devices=${prior.n_devices}`,
    );
    lines.push("");
  }

  lines.push("ble_disconnects_24h current by firmware × app");
  for (const fw of FIRMWARE_VERSIONS) {
    for (const app of APP_VERSIONS) {
      const cell = rateInWindow(telemetry, "ble_disconnects_24h", {
        window: CURRENT,
        firmware_version: fw,
        app_version: app,
      });
      if (cell.n_devices === 0) continue;
      lines.push(
        `  ${fw} × ${app}: rate=${fmt(cell.rate.value)} devices=${cell.n_devices}`,
      );
    }
  }
  lines.push("");

  lines.push("Feedback records (all). Fields: id, timestamp, firmware, app, region, tags, text.");
  for (const row of feedback) {
    lines.push(
      JSON.stringify({
        id: row.id,
        timestamp: row.timestamp,
        firmware: row.firmware_version,
        app: row.app_version,
        region: row.region,
        tags: row.tags,
        text: row.text,
      }),
    );
  }
  lines.push("");

  lines.push("Internal documents, full text.");
  const knowledgeDir = path.join(ROOT, "knowledge");
  for (const name of readdirSync(knowledgeDir).filter((n) => n.endsWith(".md")).sort()) {
    lines.push(`--- ${name} ---`);
    lines.push(readFileSync(path.join(knowledgeDir, name), "utf8"));
  }
  lines.push("");

  lines.push("Chunk catalogue (ids only, for citation if you use a passage).");
  for (const chunk of embeddings.chunks) {
    lines.push(`${chunk.chunk_id} | ${chunk.doc_id} | ${chunk.section}`);
  }

  return lines.join("\n");
}
