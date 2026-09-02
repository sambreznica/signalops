import type { Ticket, TicketPriority } from "../schema/ticket";

const PRIORITY_RANK: Record<TicketPriority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
};

/** Within a cell: priority, then due_at. Empty cells stay empty arrays. */
export function sortBoardCards(tickets: readonly Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const due = a.due_at.localeCompare(b.due_at);
    if (due !== 0) return due;
    return a.ticket_id.localeCompare(b.ticket_id);
  });
}
