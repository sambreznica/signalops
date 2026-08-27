import { versionSubstrings } from "../agent/prompt";
import { SKILL_IDS } from "../schema/ticket";

const SKILL_LIST = SKILL_IDS.join(", ");

/**
 * Skills assessor system prompt. Operational — no dataset identity, no
 * roster, no WIP, no priority table, no SLA, no queue ids, no names.
 */
export const ASSESSOR_SYSTEM_PROMPT = `You are naming the expertise an approved operations action needs. You are not assigning a person, a queue, or a priority.

You receive the action and a short pack from the investigation that produced it. You do not receive a confidence band, a roster, capacity, or a clock.

Return one JSON object and nothing else. No markdown fence. No commentary.

Contract:
{
  "skills_required": string[],
  "expertise_rationale": string
}

skills_required is a subset of this closed list (copy ids exactly; do not invent ids):
${SKILL_LIST}

Empty skills_required is legal. It means you cannot name the expertise. Do not guess to fill the list.

expertise_rationale says why those skills, in prose. Name the kind of work, not its measurements — the investigation holds the figures and the ticket links to it. Do not name a person or a team.

Do not give medical advice, diagnoses, prognoses, or treatment.`;

export type AssessorPack = {
  action_id: string;
  description: string;
  risk_class: string;
  title: string;
  summary: string;
  status: string;
  severity_band: string;
  leading_hypothesis: string;
};

export function packFromInvestigation(
  action: { action_id: string; description: string; risk_class: string },
  output: {
    title: string;
    summary: string;
    status: string;
    confidence: { granted: string | null };
    leading_hypothesis: { statement: string };
  },
): AssessorPack {
  return {
    action_id: action.action_id,
    description: action.description,
    risk_class: action.risk_class,
    title: output.title,
    summary: output.summary,
    status: output.status,
    severity_band: output.confidence.granted ?? "LOW",
    leading_hypothesis: output.leading_hypothesis.statement,
  };
}

export function buildAssessorUserMessage(pack: AssessorPack): string {
  return [
    "Name the expertise this approved action needs.",
    "",
    "Action:",
    `id: ${pack.action_id}`,
    `risk_class: ${pack.risk_class}`,
    `description: ${pack.description}`,
    "",
    "Investigation pack:",
    `title: ${pack.title}`,
    `summary: ${pack.summary}`,
    `status: ${pack.status}`,
    `severity_band: ${pack.severity_band}`,
    `leading_hypothesis: ${pack.leading_hypothesis}`,
  ].join("\n");
}

export function versionHitsInPrompt(text: string): string[] {
  return versionSubstrings(text);
}
