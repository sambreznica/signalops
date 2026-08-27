import { z } from "zod";
import type { ModelClient } from "../agent/investigator";
import { ASSESSOR_EFFORT } from "../agent/sampling";
import {
  ticketHasBareNumeral,
  ticketHasFindingRef,
} from "../schema/ticket";
import {
  ASSESSOR_SYSTEM_PROMPT,
  buildAssessorUserMessage,
  type AssessorPack,
} from "./assessor-prompt";
import type { AssessorEmit, AssessorFallback } from "./route";

const emitSchema = z.strictObject({
  skills_required: z.array(z.string()),
  expertise_rationale: z.string(),
});

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```/m.exec(trimmed);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("no JSON object in model response");
  }
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

function textFromResponse(content: { type: string; text?: string }[]): string {
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

function rejectRationale(rationale: string): boolean {
  return ticketHasFindingRef(rationale) || ticketHasBareNumeral(rationale);
}

/**
 * One structured call. No tools. No repair round.
 * A numeral (or finding ref) in expertise_rationale is a prompt finding:
 * empty skills, code-composed rationale — same path as no usable skill.
 */
export async function assessSkills(
  pack: AssessorPack,
  client: ModelClient,
): Promise<AssessorEmit> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await client.complete({
      system: ASSESSOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAssessorUserMessage(pack) }],
      toolChoice: "none",
      signal: controller.signal,
      effort: ASSESSOR_EFFORT,
    });
    const text = textFromResponse(response.content);
    let raw: unknown;
    try {
      raw = extractJsonObject(text);
    } catch {
      return {
        skills_required: [],
        expertise_rationale: "",
        fallback: "no_json",
      };
    }
    const parsed = emitSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        skills_required: [],
        expertise_rationale: "",
        fallback: "no_json",
      };
    }
    if (rejectRationale(parsed.data.expertise_rationale)) {
      return {
        skills_required: [],
        expertise_rationale: "",
        fallback: "bare_numeral",
      };
    }
    const fallback: AssessorFallback =
      parsed.data.skills_required.length === 0 ? "empty" : "none";
    return {
      skills_required: parsed.data.skills_required,
      expertise_rationale: parsed.data.expertise_rationale,
      fallback,
    };
  } finally {
    clearTimeout(timer);
  }
}
