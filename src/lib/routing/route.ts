import type { ConfidenceBand, RecommendedAction } from "../schema/investigation";
import {
  QUEUE_PREFIX,
  TRIAGE_PREFIX,
  skillIdSchema,
  ticketSchema,
  type SkillId,
  type Ticket,
  type TicketQueue,
} from "../schema/ticket";
import { composeBody, composeRationale, composeTitle } from "./compose";
import { eligibleEngineers } from "./eligibility";
import type { EngineerRecord, SkillRecord } from "./fixtures";
import { derivePriority } from "./priority";
import { queueFromSkills } from "./queue";
import { rankEngineers } from "./rank";
import { dueAt } from "./sla";

export type AssessorFallback = "none" | "empty" | "bare_numeral" | "no_json";

export type AssessorEmit = {
  skills_required: string[];
  expertise_rationale: string;
  fallback: AssessorFallback;
};

export type RouteInput = {
  action: RecommendedAction;
  investigation_id: string;
  candidate_id: string;
  granted: ConfidenceBand | null;
  existing: readonly Ticket[];
  now: Date;
  roster: readonly EngineerRecord[];
  taxonomy: readonly SkillRecord[];
  assessor: AssessorEmit;
};

export function ticketIdPrefix(queue: TicketQueue | null): string {
  return queue === null ? TRIAGE_PREFIX : QUEUE_PREFIX[queue];
}

export function nextTicketId(
  existing: readonly Ticket[],
  queue: TicketQueue | null,
): string {
  const prefix = ticketIdPrefix(queue);
  let max = 0;
  for (const ticket of existing) {
    const match = ticket.ticket_id.match(
      new RegExp(`^${prefix}-([1-9]\\d*)$`),
    );
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${max + 1}`;
}

export function existingForAction(
  tickets: readonly Ticket[],
  investigationId: string,
  actionId: string,
): Ticket | undefined {
  return tickets.find((t) => {
    if (t.source === "manual") return false;
    return (
      t.source.investigation_id === investigationId &&
      t.source.action_id === actionId
    );
  });
}

/** Local store wins. Committed artefact fills gaps so replay WIP and the inline ticket stay aligned. */
export function mergeTickets(
  local: readonly Ticket[],
  committed: readonly Ticket[],
): Ticket[] {
  const out = [...local];
  const ids = new Set(out.map((t) => t.ticket_id));
  for (const ticket of committed) {
    if (ids.has(ticket.ticket_id)) continue;
    if (ticket.source !== "manual") {
      if (
        existingForAction(
          out,
          ticket.source.investigation_id,
          ticket.source.action_id,
        )
      ) {
        continue;
      }
    }
    out.push(ticket);
    ids.add(ticket.ticket_id);
  }
  return out;
}

export function validateSkills(raw: readonly string[]): {
  skills: SkillId[];
  dropped: string[];
} {
  const skills: SkillId[] = [];
  const dropped: string[] = [];
  for (const id of raw) {
    const parsed = skillIdSchema.safeParse(id);
    if (parsed.success) skills.push(parsed.data);
    else dropped.push(id);
  }
  return { skills: [...new Set(skills)], dropped };
}

export function route(input: RouteInput): Ticket {
  const { skills, dropped } = validateSkills(input.assessor.skills_required);
  const usable =
    input.assessor.fallback === "none" || input.assessor.fallback === "empty"
      ? skills
      : [];
  const skillsForRoute =
    input.assessor.fallback === "bare_numeral" ||
    input.assessor.fallback === "no_json"
      ? []
      : usable;

  const queue = queueFromSkills(skillsForRoute, [...input.taxonomy]);
  const { priority, granted_missing } = derivePriority(
    input.action.risk_class,
    input.granted,
  );
  const rosterIds = input.roster.map((e) => e.id);
  const eligible = eligibleEngineers(skillsForRoute, input.existing, input.roster);
  const ranked = rankEngineers(
    eligible,
    skillsForRoute,
    input.existing,
    rosterIds,
  );
  const winner = ranked[0] ?? null;
  const canAssign = winner !== null && queue !== null;
  const status = canAssign ? "TODO" : queue !== null ? "BACKLOG" : "TRIAGE";
  const assignee = canAssign ? winner.id : null;
  const at = input.now.toISOString();

  let fallback: AssessorFallback = input.assessor.fallback;
  if (fallback === "none" && skillsForRoute.length === 0) fallback = "empty";

  const routing_rationale = composeRationale({
    expertise: input.assessor.expertise_rationale,
    fallback,
    dropped,
    skills: skillsForRoute,
    assignee: canAssign ? winner : null,
    granted_missing,
  });

  return ticketSchema.parse({
    ticket_id: nextTicketId(input.existing, queue),
    title: composeTitle({
      candidateId: input.candidate_id,
      action: input.action,
    }),
    body: composeBody(input.action),
    queue,
    assignee,
    priority,
    status,
    source: {
      investigation_id: input.investigation_id,
      action_id: input.action.action_id,
      candidate_id: input.candidate_id,
    },
    skills_required: skillsForRoute,
    routing_rationale,
    created_at: at,
    due_at: dueAt(input.now, priority).toISOString(),
    updated_at: at,
    notes: [],
    activity: [
      {
        kind: "created",
        from: null,
        to: status,
        actor: "routing",
        at,
      },
    ],
  });
}
