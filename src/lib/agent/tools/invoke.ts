import type { ToolName } from "../../schema";
import {
  compareVersionsArgsSchema,
  findSimilarIncidentsArgsSchema,
  queryTelemetryArgsSchema,
  searchFeedbackArgsSchema,
  searchKnowledgeArgsSchema,
} from "./args";
import { runCompareVersions } from "./compare-versions";
import { runFindSimilarIncidents } from "./find-similar-incidents";
import { runQueryTelemetry } from "./query-telemetry";
import { runSearchFeedback } from "./search-feedback";
import { runSearchKnowledge } from "./search-knowledge";
import type {
  InvokeContext,
  InvokeOutcome,
  ToolResult,
  ToolRuntime,
} from "./types";

const PARSERS = {
  query_telemetry: queryTelemetryArgsSchema,
  compare_versions: compareVersionsArgsSchema,
  search_feedback: searchFeedbackArgsSchema,
  search_knowledge: searchKnowledgeArgsSchema,
  find_similar_incidents: findSimilarIncidentsArgsSchema,
} as const;

function asArgRecord(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function formatParseError(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/** Digit-free. EVAL-04b scans result_summary. Counts stay in the tool JSON. */
export function summarise(tool: ToolName, result: ToolResult): string {
  if (!result.ok) return "tool_error";
  switch (tool) {
    case "query_telemetry": {
      const reason = result.empty_reason;
      if (reason === "filter_matched_no_devices") return "filter_matched_no_devices";
      if (reason === "no_events") return "no_events";
      return "aggregates_returned";
    }
    case "compare_versions": {
      const a = result.empty_reason_a;
      const b = result.empty_reason_b;
      if (a === "filter_matched_no_devices" || b === "filter_matched_no_devices") {
        return "filter_matched_no_devices";
      }
      if (a === "no_events" || b === "no_events") return "no_events";
      return result.ci_excludes_one === true
        ? "interval_excludes_one"
        : "interval_includes_one";
    }
    case "search_feedback": {
      const sample = result.sample_size as { value: number };
      const from = result.sampled_from as { value: number };
      if (sample.value < from.value) return "sample_is_subset";
      return "sample_is_complete";
    }
    case "search_knowledge":
      return "chunks_returned";
    case "find_similar_incidents":
      return result.truncated === true
        ? "incident_list_truncated"
        : "incident_list_complete";
  }
}

async function runTool(
  tool: ToolName,
  args: unknown,
  runtime: ToolRuntime,
  call_id: string,
): Promise<ToolResult> {
  switch (tool) {
    case "query_telemetry":
      return runQueryTelemetry(
        args as ReturnType<typeof queryTelemetryArgsSchema.parse>,
        runtime,
        call_id,
      );
    case "compare_versions":
      return runCompareVersions(
        args as ReturnType<typeof compareVersionsArgsSchema.parse>,
        runtime,
        call_id,
      );
    case "search_feedback":
      return runSearchFeedback(
        args as ReturnType<typeof searchFeedbackArgsSchema.parse>,
        runtime,
        call_id,
      );
    case "search_knowledge":
      return runSearchKnowledge(
        args as ReturnType<typeof searchKnowledgeArgsSchema.parse>,
        runtime,
        call_id,
      );
    case "find_similar_incidents":
      return runFindSimilarIncidents(
        args as ReturnType<typeof findSimilarIncidentsArgsSchema.parse>,
        runtime,
        call_id,
      );
  }
}

/**
 * Minted `call_id` is applied here: quantities are stamped inside each
 * `run*` via `asQuantity`, and the matching trace event is emitted.
 * Invalid args return `{ ok: false }` plus a trace event. No throw.
 */
export async function invoke(
  tool: ToolName,
  rawArgs: unknown,
  ctx: InvokeContext,
  runtime: ToolRuntime,
): Promise<InvokeOutcome> {
  const started = Date.now();
  const parsed = PARSERS[tool].safeParse(rawArgs);
  if (!parsed.success) {
    const error = formatParseError(parsed.error);
    const result: ToolResult = { ok: false, error };
    return {
      result,
      event: {
        kind: "tool_call",
        call_id: ctx.call_id,
        actor: ctx.actor,
        tool,
        arguments: asArgRecord(rawArgs),
        result_summary: "args_invalid",
        latency_ms: Date.now() - started,
        tokens: 0,
      },
    };
  }

  let result: ToolResult;
  try {
    result = await runTool(tool, parsed.data, runtime, ctx.call_id);
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    result,
    event: {
      kind: "tool_call",
      call_id: ctx.call_id,
      actor: ctx.actor,
      tool,
      arguments: parsed.data as Record<string, unknown>,
      result_summary: summarise(tool, result),
      latency_ms: Date.now() - started,
      tokens: 0,
    },
  };
}
