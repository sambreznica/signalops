import type { SkillId, Ticket } from "../schema/ticket";
import type { EngineerRecord } from "./fixtures";
import { currentWip, overlapCount } from "./eligibility";

/**
 * Highest |skills ∩ required|, then fewest current WIP, then roster table order.
 */
export function rankEngineers(
  eligible: readonly EngineerRecord[],
  skills: readonly SkillId[],
  tickets: readonly Ticket[],
  rosterOrder: readonly string[],
): EngineerRecord[] {
  const order = new Map(rosterOrder.map((id, i) => [id, i]));
  return [...eligible].sort((a, b) => {
    const overlap = overlapCount(b, skills) - overlapCount(a, skills);
    if (overlap !== 0) return overlap;
    const wip = currentWip(a.id, tickets) - currentWip(b.id, tickets);
    if (wip !== 0) return wip;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}
