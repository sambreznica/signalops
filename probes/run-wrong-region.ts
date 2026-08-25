/**
 * Probe runner: critic only, against a hand-constructed investigation.
 * Does not write a CertificationRun. Output stays under probes/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { passthroughCache } from "../src/lib/agent/cache";
import { criticise, cloneOutput } from "../src/lib/agent/critic";
import {
  loadEnvFiles,
  requireAnthropicApiKey,
  requireAnthropicModel,
} from "../src/lib/agent/model";
import { INVESTIGATOR_EFFORT } from "../src/lib/agent/sampling";
import { TOOL_DEFINITIONS } from "../src/lib/agent/tools/definitions";
import { loadStaticRuntime } from "../src/lib/agent/tools/runtime";
import type { ModelClient } from "../src/lib/agent/investigator";
import { encodeQuery } from "../src/lib/retrieval/embed-query";
import { investigationOutputSchema } from "../src/lib/schema";
import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../src/lib/fixtures/constants";
import { runTriage } from "../src/lib/triage";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "probes", "wrong-region-firmware.input.json");
const OUTPUT = path.join(ROOT, "probes", "wrong-region-firmware.output.json");

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

async function main(): Promise<void> {
  loadEnvFiles(ROOT);
  const model = requireAnthropicModel();
  const apiKey = requireAnthropicApiKey();
  const pre = investigationOutputSchema.parse(
    JSON.parse(readFileSync(INPUT, "utf8")),
  );

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
  const candidate = triage.find((c) => c.id === pre.signal_id);
  if (!candidate) {
    throw new Error(`probe candidate ${pre.signal_id} not in triage`);
  }

  const snapshot = cloneOutput(pre);
  const criticised = await criticise(snapshot, {
    runtime,
    client: wrapClient(new Anthropic({ apiKey }), model),
    cache: passthroughCache(),
    candidate,
  });

  const post = criticised.output;
  const delta = {
    status: snapshot.status !== post.status,
    model_requested:
      snapshot.confidence.model_requested !== post.confidence.model_requested,
    leading:
      snapshot.leading_hypothesis.statement !== post.leading_hypothesis.statement,
  };

  writeFileSync(
    OUTPUT,
    `${JSON.stringify(
      {
        kind: "critic_probe",
        note: "Not a CertificationRun. Not loaded by the eval harness.",
        input: path.relative(ROOT, INPUT),
        model,
        pre: snapshot,
        post,
        metrics: criticised.metrics,
        delta,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        kind: "critic_probe",
        file: OUTPUT,
        pre_status: snapshot.status,
        post_status: post.status,
        pre_band: snapshot.confidence.model_requested,
        post_band: post.confidence.model_requested,
        leading_changed: delta.leading,
        delta,
        critic_metrics: criticised.metrics,
        critic_effects: post.trace
          .filter((e) => e.kind === "critic_effect")
          .map((e) =>
            e.kind === "critic_effect" ? { effect: e.effect, detail: e.detail } : e,
          ),
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
