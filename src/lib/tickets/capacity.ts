import type { Ticket, TicketQueue } from "../schema/ticket";
import { QUEUE_IDS } from "../schema/ticket";
import { countsAgainstWip, currentWip } from "../routing/eligibility";
import type { EngineerRecord } from "../routing/fixtures";

export type Capacity = {
  used: number;
  limit: number;
  over: boolean;
};

/** ASSIGNED + IN_PROGRESS in the queue vs sum of home-queue WIP limits. */
export function swimlaneCapacity(
  queue: TicketQueue,
  tickets: readonly Ticket[],
  roster: readonly EngineerRecord[],
): Capacity {
  const used = tickets.filter(
    (t) => t.queue === queue && countsAgainstWip(t.status),
  ).length;
  const limit = roster
    .filter((e) => e.queue === queue)
    .reduce((sum, e) => sum + e.wip_limit, 0);
  return { used, limit, over: used > limit };
}

export function engineerCapacity(
  engineerId: string,
  tickets: readonly Ticket[],
  roster: readonly EngineerRecord[],
): Capacity {
  const eng = roster.find((e) => e.id === engineerId);
  const used = currentWip(engineerId, tickets);
  const limit = eng?.wip_limit ?? 0;
  return { used, limit, over: used > limit };
}

export function allSwimlaneCapacity(
  tickets: readonly Ticket[],
  roster: readonly EngineerRecord[],
): Record<TicketQueue, Capacity> {
  const out = {} as Record<TicketQueue, Capacity>;
  for (const queue of QUEUE_IDS) {
    out[queue] = swimlaneCapacity(queue, tickets, roster);
  }
  return out;
}
