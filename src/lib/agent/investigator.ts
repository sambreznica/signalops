import type { InvestigationOutput, ToolName, TraceEvent } from "../schema";
import {
  investigationOutputSchema,
  toolNameSchema,
  type ConfidenceBand,
} from "../schema";
import type { TriageCandidate } from "../triage/types";
import type { ToolCache } from "./cache";
import { citeableCallIds, INVESTIGATOR_SYSTEM_PROMPT } from "./prompt";
import { invoke, summarise } from "./tools/invoke";
import type { ToolRuntime } from "./tools/types";

export const MAX_TOOL_CALLS = 12;
export const MAX_CRITIC_ROUNDS = 2;
export const TIMEOUT_MS = 120_000;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type ModelResponse = {
  content: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type ModelMessage = {
  role: "user" | "assistant";
  content: string | Array<ContentBlock | ToolResultBlock>;
};

export type ModelClient = {
  complete: (args: {
    system: string;
    messages: ModelMessage[];
    toolChoice: "auto" | "none";
    signal: AbortSignal;
  }) => Promise<ModelResponse>;
};

export type InvestigationMetrics = {
  tool_calls: number;
  tokens: number;
  wall_clock_ms: number;
  cache_hits: number;
  cache_misses: number;
};

export type InvestigationOutcome = {
  output: InvestigationOutput;
  metrics: InvestigationMetrics;
};

export type InvestigateDeps = {
  runtime: ToolRuntime;
  client: ModelClient;
  cache: ToolCache;
  now?: () => number;
  userMessage: string;
};

function usageTokens(response: ModelResponse): number {
  return (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
}

function assistantText(content: ContentBlock[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function toolUses(content: ContentBlock[]): Extract<ContentBlock, { type: "tool_use" }>[] {
  return content.filter(
    (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
      block.type === "tool_use",
  );
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```/m.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("no JSON object in model response");
  }
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("\n");
}

function noteOnSummary(said: string, summary: string): string {
  if (!said.trim()) return summary;
  if (/\d/.test(said)) return summary;
  return `said: ${said} | ${summary}`;
}

function stamp(
  parsed: InvestigationOutput,
  candidate: TriageCandidate,
  trace: TraceEvent[],
): InvestigationOutput {
  return investigationOutputSchema.parse({
    ...parsed,
    investigation_id: `inv_${candidate.id}`,
    signal_id: candidate.id,
    severity: candidate.severity_index,
    affected_cohort: candidate.affected_users,
    confidence: {
      granted: null,
      model_requested: parsed.confidence.model_requested,
      ceiling_rule_applied: null,
    },
    trace,
  });
}

function provenanceErrors(
  output: InvestigationOutput,
  candidate: TriageCandidate,
  chunkIds: Set<string>,
): string[] {
  const errors: string[] = [];
  const callIds = new Set(
    output.trace
      .filter((event) => event.kind === "tool_call")
      .map((event) => event.call_id),
  );
  const listedChunks = new Set(output.knowledge_sources.map((k) => k.chunk_id));

  const sources = [
    output.severity.source,
    output.affected_cohort.source,
    ...output.deterministic_findings.map((f) => f.source),
    ...output.supporting_evidence.map((e) => e.source),
    ...output.counter_evidence.map((e) => e.source),
  ];

  for (const source of sources) {
    if (source.kind === "tool_call" && !callIds.has(source.call_id)) {
      errors.push(`orphan tool_call ${source.call_id}`);
    }
    if (source.kind === "triage" && source.signal_id !== candidate.id) {
      errors.push(`orphan triage signal_id ${source.signal_id}`);
    }
    if (source.kind === "knowledge" && !listedChunks.has(source.chunk_id)) {
      errors.push(`knowledge claim missing from knowledge_sources ${source.chunk_id}`);
    }
  }

  for (const src of output.knowledge_sources) {
    if (!chunkIds.has(src.chunk_id)) {
      errors.push(`chunk not in index: ${src.chunk_id}`);
    }
  }

  return errors;
}

function inconclusive(
  candidate: TriageCandidate,
  trace: TraceEvent[],
  uncertainty: string,
  requested: ConfidenceBand = "LOW",
): InvestigationOutput {
  return investigationOutputSchema.parse({
    investigation_id: `inv_${candidate.id}`,
    signal_id: candidate.id,
    title: "Investigation did not complete",
    status: "INCONCLUSIVE",
    severity: candidate.severity_index,
    confidence: {
      granted: null,
      model_requested: requested,
      ceiling_rule_applied: null,
    },
    summary: "The investigation did not reach a terminal finding inside the bound.",
    affected_cohort: candidate.affected_users,
    leading_hypothesis: {
      statement: "No conclusion was reached inside the bound.",
      evidence_type: "correlational",
    },
    alternative_hypotheses: [],
    deterministic_findings: [],
    supporting_evidence: [],
    counter_evidence: [],
    knowledge_sources: [],
    recommended_actions: [],
    uncertainty: [uncertainty],
    trace,
  });
}

type ParseAttempt =
  | { ok: true; output: InvestigationOutput }
  | { ok: false; error: string };

function asArgRecord(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export async function investigate(
  candidate: TriageCandidate,
  deps: InvestigateDeps,
): Promise<InvestigationOutcome> {
  const started = (deps.now ?? Date.now)();
  const deadline = started + TIMEOUT_MS;
  const remaining = () => Math.max(1, deadline - (deps.now ?? Date.now)());
  const chunkIds = new Set(deps.runtime.embeddings.chunks.map((c) => c.chunk_id));

  const messages: ModelMessage[] = [{ role: "user", content: deps.userMessage }];
  const trace: Extract<TraceEvent, { kind: "tool_call" }>[] = [];
  let seq = 1;
  let tokens = 0;
  let repairUsed = false;
  let stopNudged = false;

  const timedOut = () => (deps.now ?? Date.now)() >= deadline;

  const finish = (output: InvestigationOutput): InvestigationOutcome => ({
    output,
    metrics: {
      tool_calls: trace.length,
      tokens,
      wall_clock_ms: (deps.now ?? Date.now)() - started,
      cache_hits: deps.cache.hits,
      cache_misses: deps.cache.misses,
    },
  });

  const boundInconclusive = (reason: string) =>
    finish(inconclusive(candidate, trace, reason));

  try {
    while (true) {
      if (timedOut()) {
        return boundInconclusive(
          "Investigation stopped after the wall-clock bound.",
        );
      }

      const toolChoice = trace.length >= MAX_TOOL_CALLS || repairUsed ? "none" : "auto";
      const controller = new AbortController();
      const kill = setTimeout(() => controller.abort(), remaining());
      let response: ModelResponse;
      try {
        response = await deps.client.complete({
          system: INVESTIGATOR_SYSTEM_PROMPT,
          messages,
          toolChoice,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(kill);
      }
      tokens += usageTokens(response);

      const uses = toolUses(response.content);
      const canCall = trace.length < MAX_TOOL_CALLS && !repairUsed;

      if (uses.length > 0 && !canCall) {
        if (stopNudged) {
          return boundInconclusive(
            "Investigation stopped after the tool-call bound.",
          );
        }
        stopNudged = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: citeableCallIds(trace) });
        continue;
      }

      if (uses.length > 0) {
        messages.push({ role: "assistant", content: response.content });
        const said = assistantText(response.content);
        const results: ToolResultBlock[] = [];

        for (const use of uses) {
          if (trace.length >= MAX_TOOL_CALLS) break;
          if (timedOut()) {
            return boundInconclusive(
              "Investigation stopped after the wall-clock bound.",
            );
          }
          const parsedName = toolNameSchema.safeParse(use.name);
          if (!parsedName.success) {
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify({ ok: false, error: "unknown_tool" }),
            });
            continue;
          }
          const tool: ToolName = parsedName.data;
          const call_id = `tc_${seq}`;
          seq += 1;
          const cached = deps.cache.get(tool, use.input);
          if (cached !== undefined) {
            const summary = noteOnSummary(
              said,
              `${summarise(tool, cached)} cache_hit`,
            );
            trace.push({
              kind: "tool_call",
              call_id,
              actor: "investigator",
              tool,
              arguments: asArgRecord(use.input),
              result_summary: summary,
              latency_ms: 0,
              tokens: 0,
            });
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify({ call_id, result: cached }),
            });
            continue;
          }

          const outcome = await invoke(
            tool,
            use.input,
            { call_id, actor: "investigator" },
            deps.runtime,
          );
          deps.cache.set(tool, use.input, outcome.result);
          trace.push({
            ...outcome.event,
            result_summary: noteOnSummary(said, outcome.event.result_summary),
          });
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify({ call_id, result: outcome.result }),
          });
        }

        messages.push({ role: "user", content: results });
        continue;
      }

      const jsonText = assistantText(response.content);
      const attempt = (raw: unknown): ParseAttempt => {
        const parsed = investigationOutputSchema.safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: formatIssues(parsed.error.issues) };
        }
        const stamped = stamp(parsed.data, candidate, trace);
        const orphans = provenanceErrors(stamped, candidate, chunkIds);
        if (orphans.length > 0) {
          return { ok: false, error: orphans.join("\n") };
        }
        return { ok: true, output: stamped };
      };

      let raw: unknown;
      try {
        raw = extractJsonObject(jsonText);
      } catch (err) {
        raw = null;
        if (!repairUsed) {
          repairUsed = true;
          messages.push({ role: "assistant", content: response.content });
          messages.push({
            role: "user",
            content: `The JSON failed validation. Fix every issue. Reply with only JSON.\n${err instanceof Error ? err.message : String(err)}\n${citeableCallIds(trace)}`,
          });
          continue;
        }
        return boundInconclusive(
          "Investigation stopped after the output failed validation.",
        );
      }

      const first = attempt(raw);
      if (first.ok) return finish(first.output);

      if (!repairUsed) {
        repairUsed = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: `The JSON failed validation. Fix every issue. Reply with only JSON.\n${first.error}\n${citeableCallIds(trace)}`,
        });
        continue;
      }

      return boundInconclusive(
        "Investigation stopped after the output failed validation.",
      );
    }
  } catch (err) {
    if (timedOut() || (err instanceof Error && err.name === "AbortError")) {
      return boundInconclusive(
        "Investigation stopped after the wall-clock bound.",
      );
    }
    throw err;
  }
}
