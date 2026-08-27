"use server";

import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "@/lib/agent/investigator";
import { ASSESSOR_EFFORT } from "@/lib/agent/sampling";
import { assessSkills } from "@/lib/routing/assess";
import type { AssessorPack } from "@/lib/routing/assessor-prompt";
import type { AssessorEmit } from "@/lib/routing/route";

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

export type AssessActionResult =
  | { ok: true; emit: AssessorEmit }
  | { ok: false; reason: "unavailable" | "error"; detail: string };

export async function assessSkillsAction(
  pack: AssessorPack,
): Promise<AssessActionResult> {
  const model = process.env.ANTHROPIC_MODEL?.trim();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!model || !apiKey) {
    return { ok: false, reason: "unavailable", detail: "ANTHROPIC_MODEL or ANTHROPIC_API_KEY unset" };
  }
  try {
    const emit = await assessSkills(
      pack,
      wrapClient(new Anthropic({ apiKey }), model),
    );
    return { ok: true, emit };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "assess failed";
    return { ok: false, reason: "error", detail };
  }
}
