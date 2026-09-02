import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  certificationRunSchema,
  type CertificationRun,
} from "../evals/artefact";
import { execute } from "../src/lib/approval";
import type { ModelClient } from "../src/lib/agent/investigator";
import {
  loadEnvFiles,
  requireAnthropicApiKey,
  requireAnthropicModel,
} from "../src/lib/agent/model";
import { ASSESSOR_EFFORT } from "../src/lib/agent/sampling";
import { assessSkills } from "../src/lib/routing/assess";
import { packFromInvestigation } from "../src/lib/routing/assessor-prompt";
import { boardNow } from "../src/lib/routing/clock";
import { loadRoster, loadSkillsTaxonomy } from "../src/lib/routing/fixtures";
import { existingForAction, route } from "../src/lib/routing/route";
import {
  ticketsArtefactSchema,
  type Ticket,
  type TicketsArtefact,
} from "../src/lib/schema/ticket";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function wrapClient(client: Anthropic, model: string): ModelClient {
  return {
    async complete({ system, messages, signal, effort }) {
      const response = await client.messages.create(
        {
          model,
          max_tokens: 1024,
          system,
          messages: messages as Anthropic.MessageParam[],
          output_config: { effort: effort ?? ASSESSOR_EFFORT },
        } as Anthropic.MessageCreateParamsNonStreaming,
        { signal },
      );
      return {
        content: response.content.flatMap((block) => {
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
      };
    },
  };
}

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

async function main(): Promise<void> {
  loadEnvFiles(ROOT);
  const model = requireAnthropicModel();
  const apiKey = requireAnthropicApiKey();
  const runId = argValue("--run-id") ?? "run-board-1";
  const runFile = path.join(ROOT, "runs", `${runId}.json`);
  if (!existsSync(runFile)) {
    throw new Error(`missing run artefact ${runFile}`);
  }
  const run = certificationRunSchema.parse(
    JSON.parse(readFileSync(runFile, "utf8")),
  ) as CertificationRun;

  const client = wrapClient(new Anthropic({ apiKey }), model);
  const roster = loadRoster();
  const taxonomy = loadSkillsTaxonomy();
  const now = boardNow({ mode: "replay", runTimestamp: run.timestamp });
  const tickets: Ticket[] = [];

  const jobs = run.investigations.flatMap((row) =>
    row.output.recommended_actions.map((action) => ({
      candidateId: row.candidate_id,
      action,
      investigationId: row.output.investigation_id,
      granted: row.output.confidence.granted,
      output: row.output,
    })),
  );

  for (const job of jobs) {
    const at = now.toISOString();
    const executed = execute(job.action, {
      approvals: [{ action_id: job.action.action_id, at }],
      at,
    });
    if (!executed.ok) {
      throw new Error(`execute refused ${job.action.action_id}`);
    }
    const already = existingForAction(
      tickets,
      job.investigationId,
      job.action.action_id,
    );
    if (already) continue;
    const emit = await assessSkills(
      packFromInvestigation(job.action, job.output),
      client,
    );
    const ticket = route({
      action: job.action,
      investigation_id: job.investigationId,
      candidate_id: job.candidateId,
      granted: job.granted,
      existing: tickets,
      now,
      roster,
      taxonomy,
      assessor: emit,
    });
    tickets.push(ticket);
  }

  const artefact: TicketsArtefact = ticketsArtefactSchema.parse({
    run_id: run.run_id,
    timestamp: run.timestamp,
    model,
    effort: ASSESSOR_EFFORT,
    tickets,
  });
  mkdirSync(path.join(ROOT, "runs"), { recursive: true });
  const out = path.join(ROOT, "runs", `${runId}.tickets.json`);
  writeFileSync(out, `${JSON.stringify(artefact, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        file: out,
        tickets: artefact.tickets.map((t) => ({
          ticket_id: t.ticket_id,
          source: t.source,
          queue: t.queue,
          assignee: t.assignee,
          priority: t.priority,
          skills_required: t.skills_required,
          status: t.status,
          routing_rationale: t.routing_rationale,
        })),
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
