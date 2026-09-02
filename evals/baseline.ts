import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFiles, requireAnthropicApiKey } from "../src/lib/agent/model";
import { DEFAULT_RUN_ID } from "../src/lib/replay/constants";
import { buildBaselinePack } from "./baseline-pack";
import {
  BASELINE_SYSTEM_PROMPT,
  BASELINE_USER_PREAMBLE,
} from "./baseline-prompt";
import {
  BASELINE_RUN_ID,
  baselineEmitSchema,
  buildBaselineRun,
  extractJsonObject,
  normaliseBaselineEmit,
} from "./baseline-stamp";
import { loadHarnessContext, loadRunById } from "./load";
import { runNeutralEvals } from "./neutral";
import { EVIDENCE_PATH, ROOT, RUNS_DIR } from "./paths";
import {
  BASELINE_HEADING,
  BASELINE_LINE_TAG,
  BASELINE_SCOPE,
  formatResults,
  mergeBaselineSection,
  writeEvidence,
} from "./report";

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const p = issue.path.map(String).join(".");
      return p ? `${p}: ${issue.message}` : issue.message;
    })
    .join("\n");
}

function assistantText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Prefer ANTHROPIC_MODEL. If unset, reuse the model recorded on the default
 * replay artefact and print that — do not invent a different id.
 */
function resolveBaselineModel(): { model: string; source: string } {
  const env = process.env.ANTHROPIC_MODEL?.trim();
  if (env) return { model: env, source: "ANTHROPIC_MODEL" };
  const artefact = loadRunById(DEFAULT_RUN_ID);
  if (artefact?.model) {
    return {
      model: artefact.model,
      source: `replay artefact ${DEFAULT_RUN_ID}`,
    };
  }
  throw new Error(
    "ANTHROPIC_MODEL is unset and the default replay artefact has no model field.",
  );
}

function parseEmit(text: string) {
  const raw = extractJsonObject(text);
  return baselineEmitSchema.safeParse(normaliseBaselineEmit(raw));
}

async function complete(
  client: Anthropic,
  model: string,
  messages: Anthropic.MessageParam[],
): Promise<{ text: string; tokens: number }> {
  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    system: BASELINE_SYSTEM_PROMPT,
    messages,
    output_config: { effort: "medium" },
  } as Anthropic.MessageCreateParamsNonStreaming);
  return {
    text: assistantText(response.content),
    tokens:
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
  };
}

function writeBaselineEvidence(section: string): void {
  const existing = existsSync(EVIDENCE_PATH)
    ? readFileSync(EVIDENCE_PATH, "utf8")
    : "";
  writeEvidence(EVIDENCE_PATH, mergeBaselineSection(existing, section));
}

async function main(): Promise<void> {
  loadEnvFiles(ROOT);

  const apiKey = requireAnthropicApiKey();
  const { model, source } = resolveBaselineModel();
  console.log(
    `baseline model: ${model} (from ${source}${
      source === "ANTHROPIC_MODEL" ? "" : "; ANTHROPIC_MODEL is unset"
    })`,
  );

  const ctx = loadHarnessContext();
  const pack = buildBaselinePack();
  const userContent = `${BASELINE_USER_PREAMBLE}\n\n${pack}`;

  const client = new Anthropic({ apiKey });
  const started = Date.now();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const first = await complete(client, model, messages);
  let tokens = first.tokens;
  let parsed = parseEmit(first.text);
  let usedRepair = false;

  if (!parsed.success) {
    usedRepair = true;
    const error = formatIssues(parsed.error.issues);
    console.log(`baseline parse failed; one repair turn\n${error}`);
    messages.push({ role: "assistant", content: first.text });
    messages.push({
      role: "user",
      content: `The JSON failed validation. Fix every issue. Reply with only JSON.\n${error}`,
    });
    const repaired = await complete(client, model, messages);
    tokens += repaired.tokens;
    parsed = parseEmit(repaired.text);
    if (!parsed.success) {
      throw new Error(
        `baseline emit failed after one repair:\n${formatIssues(parsed.error.issues)}`,
      );
    }
  }

  const wallClockMs = Date.now() - started;
  const run = buildBaselineRun({
    emit: parsed.data,
    ctx,
    model,
    wallClockMs,
    tokens,
  });

  const outPath = path.join(RUNS_DIR, `${BASELINE_RUN_ID}.json`);
  writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`);

  const scored = runNeutralEvals({ ...ctx, run, runError: null });
  const section = formatResults(
    BASELINE_HEADING,
    scored,
    [
      BASELINE_SCOPE,
      `run: ${run.run_id} (kind=${run.kind})`,
      `model: ${run.model}`,
      `effort: ${run.effort}`,
      `n: ${run.n}`,
      `tool_calls: 0`,
      `repair: ${usedRepair ? "used" : "not used"}`,
      `tokens: ${tokens}`,
      `wall_clock_ms: ${wallClockMs}`,
      `trace: empty on every investigation (EVAL-02 cannot pass by invented tool use)`,
    ],
    BASELINE_LINE_TAG,
  );
  console.log(section);
  writeBaselineEvidence(section);

  const eval10 = scored.find((r) => r.id === "EVAL-10");
  const ok = scored.every((r) => r.pass) && Boolean(eval10?.pass);
  process.exit(ok ? 0 : 1);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
