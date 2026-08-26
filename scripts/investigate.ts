import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  certificationRunSchema,
  type CertificationRun,
  type InvestigationRecord,
} from "../evals/artefact";
import { createDiskCache, passthroughCache } from "../src/lib/agent/cache";
import { investigate, type ModelClient } from "../src/lib/agent/investigator";
import { criticise, cloneOutput, skipCritic } from "../src/lib/agent/critic";
import { applyCeiling } from "../src/lib/agent/ceiling";
import {
  loadEnvFiles,
  requireAnthropicApiKey,
  requireAnthropicModel,
} from "../src/lib/agent/model";
import { buildUserMessage } from "../src/lib/agent/prompt";
import { TOOL_DEFINITIONS } from "../src/lib/agent/tools/definitions";
import { loadStaticRuntime } from "../src/lib/agent/tools/runtime";
import { INVESTIGATOR_EFFORT } from "../src/lib/agent/sampling";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../src/lib/fixtures/constants";
import { encodeQuery } from "../src/lib/retrieval/embed-query";
import { runTriage } from "../src/lib/triage";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function wrapClient(client: Anthropic, model: string): ModelClient {
  return {
    async complete({ system, messages, toolChoice, signal, effort }) {
      const response = await client.messages.create(
        {
          model,
          max_tokens: 8192,
          system,
          tools: TOOL_DEFINITIONS,
          tool_choice: { type: toolChoice },
          messages: messages as Anthropic.MessageParam[],
          output_config: { effort: effort ?? INVESTIGATOR_EFFORT },
        } as Anthropic.MessageCreateParamsNonStreaming,
        { signal },
      );
      return {
        content: response.content.flatMap((block) => {
          if (block.type === "tool_use") {
            return [
              {
                type: "tool_use" as const,
                id: block.id,
                name: block.name,
                input: block.input,
              },
            ];
          }
          if (block.type === "text" && block.text.trim().length > 0) {
            return [{ type: "text" as const, text: block.text }];
          }
          if (block.type === "thinking") {
            return [
              {
                type: "thinking" as const,
                thinking: block.thinking,
                signature: block.signature,
              },
            ];
          }
          if (block.type === "redacted_thinking") {
            return [{ type: "redacted_thinking" as const, data: block.data }];
          }
          return [];
        }),
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    },
  };
}

function loadOrCreateRun(
  file: string,
  runId: string,
  model: string,
): CertificationRun {
  if (existsSync(file)) {
    const parsed = certificationRunSchema.safeParse(
      JSON.parse(readFileSync(file, "utf8")),
    );
    if (!parsed.success) {
      throw new Error(`existing run failed schema: ${parsed.error.issues[0]?.message}`);
    }
    if (parsed.data.model !== model) {
      throw new Error(
        `runs/${runId}.json was produced by ${parsed.data.model}; refusing to mix with ${model}`,
      );
    }
    if (parsed.data.effort !== INVESTIGATOR_EFFORT) {
      throw new Error(
        `runs/${runId}.json was produced at effort ${parsed.data.effort}; refusing to mix with ${INVESTIGATOR_EFFORT}`,
      );
    }
    return parsed.data;
  }
  return {
    run_id: runId,
    timestamp: new Date().toISOString(),
    model,
    effort: INVESTIGATOR_EFFORT,
    n: 1,
    kind: "agent",
    investigations: [],
    approvals: [],
    execution_log: [],
  };
}

async function main(): Promise<void> {
  loadEnvFiles(ROOT);
  const model = requireAnthropicModel();
  const apiKey = requireAnthropicApiKey();
  const candidateId = argValue("--candidate");
  if (!candidateId) {
    throw new Error("Usage: npm run investigate -- --candidate <id> [--run-id <id>] [--no-cache]");
  }

  const runtime = loadStaticRuntime(ROOT, async (text) =>
    encodeQuery(runtime.embeddings.model, text),
  );

  const triage = runTriage({
    telemetry: [...runtime.telemetry],
    feedback: [...runtime.feedback],
    taxonomy: [...runtime.taxonomy],
    current: { start: CURRENT_WINDOW_START, end: CURRENT_WINDOW_END },
    prior: { start: PRIOR_WINDOW_START, end: PRIOR_WINDOW_END },
  });
  const candidate = triage.find((c) => c.id === candidateId);
  if (!candidate) {
    const ids = triage.map((c) => c.id).join(", ");
    throw new Error(`unknown candidate ${candidateId}. Known: ${ids}`);
  }

  const cache = hasFlag("--no-cache")
    ? passthroughCache()
    : createDiskCache(ROOT, path.join(ROOT, "runs", "tool-cache.json"));

  const client = wrapClient(new Anthropic({ apiKey }), model);
  const outcome = await investigate(candidate, {
    runtime,
    client,
    cache,
    userMessage: buildUserMessage(candidate),
  });

  const pre_critic = cloneOutput(outcome.output);
  const criticised =
    outcome.stop_reason !== "completed"
      ? {
          output: skipCritic(pre_critic, outcome.stop_reason),
          skipped: true,
          metrics: {
            tool_calls: 0,
            tokens: 0,
            wall_clock_ms: 0,
            cache_hits: 0,
            cache_misses: 0,
          },
        }
      : await criticise(pre_critic, {
          runtime,
          client,
          cache,
          candidate,
        });

  const capped = applyCeiling(criticised.output, pre_critic);

  const record: InvestigationRecord = {
    candidate_id: candidate.id,
    output: capped,
    pre_critic,
    stop_reason: outcome.stop_reason,
    validation_error: outcome.validation_error,
    validation_emit: outcome.validation_emit,
    validation_attempts: outcome.validation_attempts,
    metrics: outcome.metrics,
  };

  const runId =
    argValue("--run-id") ?? `run-${new Date().toISOString().replaceAll(":", "")}`;
  const runsDir = path.join(ROOT, "runs");
  mkdirSync(runsDir, { recursive: true });
  const file = path.join(runsDir, `${runId}.json`);
  const current = loadOrCreateRun(file, runId, model);
  const investigations = current.investigations.filter(
    (row) => row.candidate_id !== candidate.id,
  );
  investigations.push(record);
  const next: CertificationRun = certificationRunSchema.parse({
    ...current,
    timestamp: new Date().toISOString(),
    investigations,
  });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        run_id: next.run_id,
        file,
        candidate_id: candidate.id,
        status: capped.status,
        stop_reason: outcome.stop_reason,
        validation_error: outcome.validation_error,
        validation_attempts: outcome.validation_attempts,
        model_requested: capped.confidence.model_requested,
        granted: capped.confidence.granted,
        ceiling_rule_applied: capped.confidence.ceiling_rule_applied,
        metrics: outcome.metrics,
        critic_metrics: criticised.metrics,
        critic_skipped: criticised.skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
