import { z } from "zod";
import type {
  ConfidenceBand,
  InvestigationOutput,
  Status,
  ToolName,
  TraceEvent,
} from "../schema";
import {
  alternativeHypothesisSchema,
  claimDisciplineErrors,
  confidenceBandSchema,
  evidenceItemSchema,
  investigationOutputSchema,
  leadingHypothesisSchema,
  statusSchema,
  toolNameSchema,
} from "../schema";
import type { TriageCandidate } from "../triage/types";
import { factsFromToolResults, type RecordedToolCall } from "./bound-record";
import type { ToolCache } from "./cache";
import { buildCriticUserMessage, CRITIC_SYSTEM_PROMPT } from "./critic-prompt";
import {
  CRITIC_TIMEOUT_MS,
  MAX_CRITIC_ROUNDS,
  MAX_CRITIC_TOOL_CALLS,
  type ContentBlock,
  type InvestigationMetrics,
  type ModelClient,
  type ModelMessage,
  type ModelResponse,
  type StopReason,
  type ToolResultBlock,
} from "./investigator";
import { CRITIC_EFFORT } from "./sampling";
import { invoke, summarise } from "./tools/invoke";
import type { ToolRuntime } from "./tools/types";

export const criticPatchSchema = z
  .strictObject({
    alternative_hypotheses: z.array(alternativeHypothesisSchema).min(1),
    status: statusSchema.optional(),
    model_requested: confidenceBandSchema.optional(),
    leading_hypothesis: leadingHypothesisSchema.optional(),
    counter_evidence: z.array(evidenceItemSchema).optional(),
    uncertainty: z.array(z.string()).optional(),
    summary: z.string().optional(),
  })
  .refine(
    (patch) =>
      patch.alternative_hypotheses.every((h) => h.falsifying_test.trim().length > 0),
    { message: "falsifying_test must be non-empty" },
  );

export type CriticPatch = z.infer<typeof criticPatchSchema>;

export type CriticOutcome = {
  output: InvestigationOutput;
  metrics: InvestigationMetrics;
  skipped: boolean;
};

export type CriticiseDeps = {
  runtime: ToolRuntime;
  client: ModelClient;
  cache: ToolCache;
  now?: () => number;
  candidate: TriageCandidate;
};

const INCIDENT_STRENGTH: Record<Status, number> = {
  CONFIRMED: 3,
  UNCERTAIN: 2,
  INCONCLUSIVE: 1,
  NOT_AN_INCIDENT: 0,
};

const BAND_STRENGTH: Record<ConfidenceBand, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const RULE_SEES_LESS =
  "critic sees less evidence than the investigator so it cannot assert more";

export function statusDowngradeAllowed(from: Status, to: Status): boolean {
  return INCIDENT_STRENGTH[to] <= INCIDENT_STRENGTH[from];
}

export function bandDowngradeAllowed(
  from: ConfidenceBand,
  to: ConfidenceBand,
): boolean {
  return BAND_STRENGTH[to] <= BAND_STRENGTH[from];
}

export function cloneOutput(output: InvestigationOutput): InvestigationOutput {
  return investigationOutputSchema.parse(JSON.parse(JSON.stringify(output)));
}

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

function asArgRecord(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function nextCallSeq(output: InvestigationOutput): number {
  const n = output.trace.filter((event) => event.kind === "tool_call").length;
  return n + 1;
}

function criticCiteableIds(output: InvestigationOutput): string {
  const ids = output.trace
    .filter((event) => event.kind === "tool_call")
    .map((event) => event.call_id);
  return [
    "source.call_id must be one of these. Inventing an id is a validation failure:",
    ...ids,
  ].join("\n");
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

function appendCriticFacts(
  investigator: InvestigationOutput,
  recorded: readonly RecordedToolCall[],
): Pick<InvestigationOutput, "deterministic_findings" | "knowledge_sources"> {
  const extra = factsFromToolResults(recorded);
  const offset = investigator.deterministic_findings.length;
  const deterministic_findings = [
    ...investigator.deterministic_findings,
    ...extra.deterministic_findings.map((finding, i) => ({
      ...finding,
      id: `f_${offset + i + 1}`,
    })),
  ];
  const byChunk = new Map(
    investigator.knowledge_sources.map((chunk) => [chunk.chunk_id, chunk]),
  );
  for (const chunk of extra.knowledge_sources) {
    const prior = byChunk.get(chunk.chunk_id);
    if (!prior || chunk.score > prior.score) {
      byChunk.set(chunk.chunk_id, chunk);
    }
  }
  return {
    deterministic_findings,
    knowledge_sources: [...byChunk.values()],
  };
}

function effect(
  kind: string,
  detail: string,
): Extract<TraceEvent, { kind: "critic_effect" }> {
  return { kind: "critic_effect", effect: kind, detail };
}

export function skipCritic(
  investigator: InvestigationOutput,
  stop_reason: Exclude<StopReason, "completed">,
): InvestigationOutput {
  const cloned = cloneOutput(investigator);
  return investigationOutputSchema.parse({
    ...cloned,
    trace: [
      ...cloned.trace,
      effect(
        "skipped",
        `no leading hypothesis to falsify; stop_reason ${stop_reason}`,
      ),
    ],
  });
}

export function applyCriticPatch(
  investigator: InvestigationOutput,
  patch: CriticPatch,
  extras: {
    criticTrace?: TraceEvent[];
    recorded?: readonly RecordedToolCall[];
  } = {},
): InvestigationOutput {
  const facts = appendCriticFacts(investigator, extras.recorded ?? []);
  const effects: Extract<TraceEvent, { kind: "critic_effect" }>[] = [];

  let status = investigator.status;
  if (patch.status !== undefined) {
    if (statusDowngradeAllowed(investigator.status, patch.status)) {
      if (patch.status !== investigator.status) {
        effects.push(
          effect(
            "status_downgraded",
            `${investigator.status} to ${patch.status}`,
          ),
        );
      }
      status = patch.status;
    } else {
      effects.push(
        effect(
          "status_upgrade_refused",
          `proposed ${patch.status}; ${RULE_SEES_LESS}`,
        ),
      );
    }
  }

  let model_requested = investigator.confidence.model_requested;
  if (patch.model_requested !== undefined) {
    if (
      bandDowngradeAllowed(
        investigator.confidence.model_requested,
        patch.model_requested,
      )
    ) {
      if (patch.model_requested !== investigator.confidence.model_requested) {
        effects.push(
          effect(
            "band_downgraded",
            `${investigator.confidence.model_requested} to ${patch.model_requested}`,
          ),
        );
      }
      model_requested = patch.model_requested;
    } else {
      effects.push(
        effect(
          "band_upgrade_refused",
          `proposed ${patch.model_requested}; ${RULE_SEES_LESS}`,
        ),
      );
    }
  }

  const leading = patch.leading_hypothesis ?? investigator.leading_hypothesis;
  if (
    patch.leading_hypothesis &&
    patch.leading_hypothesis.statement !== investigator.leading_hypothesis.statement
  ) {
    effects.push(effect("leading_replaced", "leading hypothesis replaced"));
  }

  effects.push(effect("applied", "patch applied"));

  return investigationOutputSchema.parse({
    ...investigator,
    status,
    summary: patch.summary ?? investigator.summary,
    confidence: {
      granted: null,
      model_requested,
      ceiling_rule_applied: null,
    },
    leading_hypothesis: leading,
    alternative_hypotheses: patch.alternative_hypotheses,
    deterministic_findings: facts.deterministic_findings,
    counter_evidence: [
      ...investigator.counter_evidence,
      ...(patch.counter_evidence ?? []),
    ],
    knowledge_sources: facts.knowledge_sources,
    uncertainty: [...investigator.uncertainty, ...(patch.uncertainty ?? [])],
    trace: [
      ...investigator.trace,
      ...(extras.criticTrace ?? []),
      ...effects,
    ],
  });
}

function abandon(
  investigator: InvestigationOutput,
  criticTrace: TraceEvent[],
  detail: string,
): InvestigationOutput {
  return investigationOutputSchema.parse({
    ...cloneOutput(investigator),
    trace: [...investigator.trace, ...criticTrace, effect("abandoned", detail)],
  });
}

type ParseAttempt =
  | { ok: true; patch: CriticPatch }
  | { ok: false; error: string };

export async function criticise(
  investigator: InvestigationOutput,
  deps: CriticiseDeps,
): Promise<CriticOutcome> {
  const started = (deps.now ?? Date.now)();
  const deadline = started + CRITIC_TIMEOUT_MS;
  const remaining = () => Math.max(1, deadline - (deps.now ?? Date.now)());
  const chunkIds = new Set(deps.runtime.embeddings.chunks.map((c) => c.chunk_id));
  const base = cloneOutput(investigator);

  const messages: ModelMessage[] = [
    { role: "user", content: buildCriticUserMessage(deps.candidate, base) },
  ];
  const criticTrace: Extract<TraceEvent, { kind: "tool_call" }>[] = [];
  const recorded: RecordedToolCall[] = [];
  let seq = nextCallSeq(base);
  let tokens = 0;
  let repairUsed = false;
  let rounds = 0;
  const hitsAtStart = deps.cache.hits;
  const missesAtStart = deps.cache.misses;

  const timedOut = () => (deps.now ?? Date.now)() >= deadline;

  const done = (output: InvestigationOutput): CriticOutcome => ({
    output,
    skipped: false,
    metrics: {
      tool_calls: criticTrace.length,
      tokens,
      wall_clock_ms: (deps.now ?? Date.now)() - started,
      cache_hits: deps.cache.hits - hitsAtStart,
      cache_misses: deps.cache.misses - missesAtStart,
    },
  });

  try {
    while (true) {
      if (timedOut()) {
        return done(
          abandon(base, criticTrace, "critic stopped after the wall-clock bound"),
        );
      }

      const toolChoice =
        criticTrace.length >= MAX_CRITIC_TOOL_CALLS ||
        rounds >= MAX_CRITIC_ROUNDS ||
        repairUsed
          ? "none"
          : "auto";
      const controller = new AbortController();
      const kill = setTimeout(() => controller.abort(), remaining());
      let response: ModelResponse;
      try {
        response = await deps.client.complete({
          system: CRITIC_SYSTEM_PROMPT,
          messages,
          toolChoice,
          signal: controller.signal,
          effort: CRITIC_EFFORT,
        });
      } finally {
        clearTimeout(kill);
      }
      tokens += usageTokens(response);

      const uses = toolUses(response.content);
      const canCall =
        criticTrace.length < MAX_CRITIC_TOOL_CALLS &&
        rounds < MAX_CRITIC_ROUNDS &&
        !repairUsed;

      if (uses.length > 0 && !canCall) {
        return done(
          abandon(base, criticTrace, "critic stopped after the tool-call bound"),
        );
      }

      if (uses.length > 0) {
        rounds += 1;
        messages.push({ role: "assistant", content: response.content });
        const said = assistantText(response.content);
        const results: ToolResultBlock[] = [];

        for (const use of uses) {
          if (criticTrace.length >= MAX_CRITIC_TOOL_CALLS) break;
          if (timedOut()) {
            return done(
              abandon(
                base,
                criticTrace,
                "critic stopped after the wall-clock bound",
              ),
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
            criticTrace.push({
              kind: "tool_call",
              call_id,
              actor: "critic",
              tool,
              arguments: asArgRecord(use.input),
              result_summary: summary,
              latency_ms: 0,
              tokens: 0,
            });
            recorded.push({
              call_id,
              tool,
              arguments: asArgRecord(use.input),
              result: cached,
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
            { call_id, actor: "critic" },
            deps.runtime,
          );
          deps.cache.set(tool, use.input, outcome.result);
          criticTrace.push({
            ...outcome.event,
            result_summary: noteOnSummary(said, outcome.event.result_summary),
          });
          recorded.push({
            call_id,
            tool,
            arguments: asArgRecord(use.input),
            result: outcome.result,
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
        const parsed = criticPatchSchema.safeParse(raw);
        if (!parsed.success) {
          return { ok: false, error: formatIssues(parsed.error.issues) };
        }
        const merged = applyCriticPatch(base, parsed.data, {
          criticTrace,
          recorded,
        });
        const orphans = provenanceErrors(merged, deps.candidate, chunkIds);
        if (orphans.length > 0) {
          return { ok: false, error: orphans.join("\n") };
        }
        const discipline = claimDisciplineErrors(merged);
        if (discipline.length > 0) {
          return { ok: false, error: discipline.join("\n") };
        }
        return { ok: true, patch: parsed.data };
      };

      let raw: unknown;
      try {
        raw = extractJsonObject(jsonText);
      } catch (err) {
        if (!repairUsed) {
          repairUsed = true;
          messages.push({ role: "assistant", content: response.content });
          messages.push({
            role: "user",
            content: `The JSON failed validation. Fix every issue. Reply with only JSON.\n${err instanceof Error ? err.message : String(err)}\n${criticCiteableIds({ ...base, trace: [...base.trace, ...criticTrace] })}`,
          });
          continue;
        }
        return done(
          abandon(
            base,
            criticTrace,
            "critic stopped after the output failed validation",
          ),
        );
      }

      const first = attempt(raw);
      if (first.ok) {
        return done(
          applyCriticPatch(base, first.patch, {
            criticTrace,
            recorded,
          }),
        );
      }

      if (!repairUsed) {
        repairUsed = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: `The JSON failed validation. Fix every issue. Reply with only JSON.\n${first.error}\n${criticCiteableIds({ ...base, trace: [...base.trace, ...criticTrace] })}`,
        });
        continue;
      }

      return done(
        abandon(
          base,
          criticTrace,
          "critic stopped after the output failed validation",
        ),
      );
    }
  } catch (err) {
    if (timedOut() || (err instanceof Error && err.name === "AbortError")) {
      return done(
        abandon(base, criticTrace, "critic stopped after the wall-clock bound"),
      );
    }
    throw err;
  }
}
