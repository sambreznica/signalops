import type { InvestigationOutput } from "../schema/investigation";
import type { Ticket } from "../schema/ticket";
import { overlapCount } from "../routing/eligibility";
import { engineerById, type EngineerRecord } from "../routing/fixtures";
import type { Chunk } from "../retrieval/types";

export type RoutingSplit = {
  assessor: { skills: Ticket["skills_required"]; words: string };
  code: {
    overlapCount: number;
    overlapSkills: string[];
    wipCheck: string;
    tieBreak: string;
    words: string;
  };
};

/**
 * Assessor half is the expertise prose (and the skills it named).
 * Code half is overlap, WIP, tie-break — computed, then labelled from
 * the composed rationale so the drawer can show which half is which.
 */
export function splitRoutingRationale(
  ticket: Ticket,
  roster: readonly EngineerRecord[] = [],
): RoutingSplit {
  const selected = ticket.routing_rationale.match(
    /^(.*?)\s+((?:[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*) selected: .*)$/,
  );
  const none = ticket.routing_rationale.match(
    /^(.*?)\s+(No eligible engineer under capacity\.)$/,
  );
  const assessorWords = (
    selected?.[1] ??
    none?.[1] ??
    ticket.routing_rationale
  ).trim();
  const codeWords = (selected?.[2] ?? none?.[2] ?? "").trim();

  const engineer = ticket.assignee
    ? engineerById(ticket.assignee, roster)
    : undefined;
  const overlapSkills = engineer
    ? engineer.skills.filter((s) => ticket.skills_required.includes(s))
    : [];
  const overlap = engineer
    ? overlapCount(engineer, ticket.skills_required)
    : 0;
  const wipCheck = /under capacity/.test(codeWords)
    ? "under capacity"
    : codeWords.includes("No eligible")
      ? "no eligible engineer under capacity"
      : "capacity not recorded";
  const tieBreak = /roster order/.test(codeWords)
    ? "roster order as remaining tie"
    : "no tie-break applied";

  return {
    assessor: { skills: ticket.skills_required, words: assessorWords },
    code: {
      overlapCount: overlap,
      overlapSkills,
      wipCheck,
      tieBreak,
      words: codeWords,
    },
  };
}

export type InheritedChunk = {
  chunk_id: string;
  doc_id: string;
  section: string;
  score: number;
  text: string;
};

/**
 * The ticket retrieved nothing. It inherits grounding from the source
 * investigation's knowledge-backed supporting evidence. Empty is honest.
 */
export function inheritedKnowledge(
  ticket: Ticket,
  investigation: InvestigationOutput | null,
  chunks: ReadonlyMap<string, Chunk>,
): InheritedChunk[] {
  if (ticket.source === "manual" || !investigation) return [];
  const cited = new Set<string>();
  for (const item of investigation.supporting_evidence) {
    if (item.source.kind === "knowledge") cited.add(item.source.chunk_id);
  }
  if (cited.size === 0) return [];
  return investigation.knowledge_sources
    .filter((k) => cited.has(k.chunk_id))
    .map((k) => ({
      chunk_id: k.chunk_id,
      doc_id: k.doc_id,
      section: k.section,
      score: k.score,
      text: chunks.get(k.chunk_id)?.text ?? "",
    }));
}

export function sourceCandidateId(ticket: Ticket): string | null {
  if (ticket.source === "manual") return null;
  return ticket.source.candidate_id;
}

export function sourceInvestigationId(ticket: Ticket): string | null {
  if (ticket.source === "manual") return null;
  return ticket.source.investigation_id;
}

export function sourceActionId(ticket: Ticket): string | null {
  if (ticket.source === "manual") return null;
  return ticket.source.action_id;
}

export function confidenceSentence(output: InvestigationOutput): string {
  const granted = output.confidence.granted ?? "none";
  const requested = output.confidence.model_requested;
  const ceiling = output.confidence.ceiling_rule_applied;
  const status = output.status;
  if (ceiling) {
    return `Status ${status}. Asked ${requested}; code granted ${granted}. Ceiling: ${ceiling}.`;
  }
  return `Status ${status}. Granted ${granted}, requested ${requested}. No ceiling override.`;
}
