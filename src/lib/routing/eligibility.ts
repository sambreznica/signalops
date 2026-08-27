import type { SkillId, Ticket } from "../schema/ticket";
import type { EngineerRecord } from "./fixtures";

export function countsAgainstWip(status: Ticket["status"]): boolean {
  return status === "ASSIGNED" || status === "IN_PROGRESS";
}

export function currentWip(
  engineerId: string,
  tickets: readonly Ticket[],
): number {
  return tickets.filter(
    (t) => t.assignee === engineerId && countsAgainstWip(t.status),
  ).length;
}

export function eligibleEngineers(
  skills: readonly SkillId[],
  tickets: readonly Ticket[],
  roster: readonly EngineerRecord[],
): EngineerRecord[] {
  if (skills.length === 0) return [];
  const required = new Set(skills);
  return roster.filter((eng) => {
    const overlap = eng.skills.filter((s) => required.has(s));
    if (overlap.length === 0) return false;
    return currentWip(eng.id, tickets) < eng.wip_limit;
  });
}

export function overlapCount(
  engineer: EngineerRecord,
  skills: readonly SkillId[],
): number {
  const required = new Set(skills);
  return engineer.skills.filter((s) => required.has(s)).length;
}
