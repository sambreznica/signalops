import type { DeterministicFinding, Quantity, ToolName } from "../schema";
import { quantitySchema } from "../schema";
import type { ToolResult } from "./tools/types";

export type RecordedToolCall = {
  call_id: string;
  tool: ToolName;
  arguments: Record<string, unknown>;
  result: ToolResult;
};

function argStr(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function holdStr(args: Record<string, unknown>, key: string): string | null {
  const hold = args.hold;
  if (hold === null || typeof hold !== "object" || Array.isArray(hold)) {
    return null;
  }
  const value = (hold as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asQuantity(value: unknown): Quantity | null {
  const parsed = quantitySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function qualifier(parts: (string | null)[]): string {
  return parts.filter((p): p is string => p !== null).join(", ");
}

function queryLabel(args: Record<string, unknown>): string {
  return qualifier([
    argStr(args, "metric"),
    argStr(args, "window") ? `${argStr(args, "window")} window` : null,
    argStr(args, "firmware_version")
      ? `firmware ${argStr(args, "firmware_version")}`
      : null,
    argStr(args, "app_version") ? `app ${argStr(args, "app_version")}` : null,
    argStr(args, "region"),
    argStr(args, "tag"),
  ]);
}

function versionBit(axis: string | null, version: string | null): string | null {
  if (!version) return null;
  if (axis === "firmware_version") return `firmware ${version}`;
  if (axis === "app_version") return `app ${version}`;
  return axis ? `${axis} ${version}` : version;
}

function compareSideLabel(
  args: Record<string, unknown>,
  side: "a" | "b",
): string {
  const version = side === "a" ? argStr(args, "version_a") : argStr(args, "version_b");
  const axis = argStr(args, "axis");
  return qualifier([
    argStr(args, "metric"),
    versionBit(axis, version),
    argStr(args, "window") ? `${argStr(args, "window")} window` : null,
    holdStr(args, "app_version") ? `app ${holdStr(args, "app_version")}` : null,
    holdStr(args, "firmware_version")
      ? `firmware ${holdStr(args, "firmware_version")}`
      : null,
    holdStr(args, "region"),
  ]);
}

function compareRatioLabel(args: Record<string, unknown>): string {
  const axis = argStr(args, "axis");
  const a = argStr(args, "version_a");
  const b = argStr(args, "version_b");
  const vs =
    a && b
      ? axis === "firmware_version"
        ? `firmware ${a} vs ${b}`
        : axis === "app_version"
          ? `app ${a} vs ${b}`
          : `${a} vs ${b}`
      : null;
  return qualifier([
    argStr(args, "metric"),
    vs,
    argStr(args, "window") ? `${argStr(args, "window")} window` : null,
    holdStr(args, "app_version") ? `app ${holdStr(args, "app_version")}` : null,
    holdStr(args, "firmware_version")
      ? `firmware ${holdStr(args, "firmware_version")}`
      : null,
  ]);
}

function feedbackLabel(args: Record<string, unknown>): string {
  return qualifier([
    argStr(args, "tag") ? `${argStr(args, "tag")} records` : "feedback records",
    argStr(args, "window") ? `${argStr(args, "window")} window` : null,
    argStr(args, "firmware_version")
      ? `firmware ${argStr(args, "firmware_version")}`
      : null,
  ]);
}

function pushFinding(
  findings: DeterministicFinding[],
  label: string,
  quantity: Quantity | null,
): void {
  if (!quantity) return;
  if (label.length === 0) return;
  findings.push({
    id: `f_${findings.length + 1}`,
    label,
    value: quantity.value,
    unit: quantity.unit,
    source: quantity.source,
  });
}

type KnowledgeChunk = {
  doc_id: string;
  title: string;
  section: string;
  chunk_id: string;
  score: number;
};

function asChunk(value: unknown): KnowledgeChunk | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.doc_id !== "string") return null;
  if (typeof row.title !== "string") return null;
  if (typeof row.section !== "string") return null;
  if (typeof row.chunk_id !== "string") return null;
  if (typeof row.score !== "number") return null;
  return {
    doc_id: row.doc_id,
    title: row.title,
    section: row.section,
    chunk_id: row.chunk_id,
    score: row.score,
  };
}

/**
 * Project tool JSON onto findings and knowledge_sources.
 *
 * Labels are composed from tool arguments (metric, window, versions, tag) —
 * identifiers, not synthesis. Values are quantities the tool already stamped.
 * The persisted trace cannot do this: result_summary is digit-free by design.
 * Callers must pass the in-memory ToolResult from the same loop.
 */
export function factsFromToolResults(calls: readonly RecordedToolCall[]): {
  deterministic_findings: DeterministicFinding[];
  knowledge_sources: KnowledgeChunk[];
} {
  const findings: DeterministicFinding[] = [];
  const byChunk = new Map<string, KnowledgeChunk>();

  for (const call of calls) {
    if (!call.result.ok) continue;
    const result = call.result;
    const args = call.arguments;

    if (call.tool === "query_telemetry") {
      const empty = result.empty === true;
      if (empty) {
        pushFinding(
          findings,
          queryLabel(args),
          asQuantity(result.n_devices_before_metric),
        );
      } else {
        pushFinding(findings, queryLabel(args), asQuantity(result.rate));
      }
    }

    if (call.tool === "compare_versions") {
      pushFinding(
        findings,
        compareSideLabel(args, "a"),
        asQuantity(result.rate_a),
      );
      pushFinding(
        findings,
        compareSideLabel(args, "b"),
        asQuantity(result.rate_b),
      );
      pushFinding(
        findings,
        compareRatioLabel(args),
        asQuantity(result.ratio),
      );
    }

    if (call.tool === "search_feedback") {
      pushFinding(findings, feedbackLabel(args), asQuantity(result.n_matched));
    }

    if (call.tool === "search_knowledge" && Array.isArray(result.chunks)) {
      for (const raw of result.chunks) {
        const chunk = asChunk(raw);
        if (!chunk) continue;
        const prior = byChunk.get(chunk.chunk_id);
        if (!prior || chunk.score > prior.score) {
          byChunk.set(chunk.chunk_id, chunk);
        }
      }
    }
  }

  return {
    deterministic_findings: findings,
    knowledge_sources: [...byChunk.values()].map((chunk) => ({
      doc_id: chunk.doc_id,
      title: chunk.title,
      section: chunk.section,
      chunk_id: chunk.chunk_id,
      score: chunk.score,
    })),
  };
}
