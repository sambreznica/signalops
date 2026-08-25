import type { TraceEvent } from "../../schema";
import type { FeedbackRecord, TagTaxonomyEntry, TelemetryRecord } from "../../fixtures/types";
import type { EmbeddingIndex } from "../../retrieval/types";

export type EmptyReason = "filter_matched_no_devices" | "no_events";

export type ToolErr = { ok: false; error: string };

export type ToolOk = { ok: true } & Record<string, unknown>;

export type ToolResult = ToolOk | ToolErr;

export type InvokeContext = {
  call_id: string;
  actor: "investigator" | "critic";
};

export type InvokeOutcome = {
  result: ToolResult;
  event: Extract<TraceEvent, { kind: "tool_call" }>;
};

export type ToolRuntime = {
  telemetry: readonly TelemetryRecord[];
  feedback: readonly FeedbackRecord[];
  taxonomy: readonly TagTaxonomyEntry[];
  embeddings: EmbeddingIndex;
  embedQuery: (text: string) => Promise<number[]>;
};

export function emptyReason(
  nDevicesBeforeMetric: number,
  eventTotal: number,
): EmptyReason | null {
  if (nDevicesBeforeMetric === 0) return "filter_matched_no_devices";
  if (eventTotal === 0) return "no_events";
  return null;
}
