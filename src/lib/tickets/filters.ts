import type {
  Ticket,
  TicketPriority,
  TicketQueue,
  TicketStatus,
} from "../schema/ticket";

export type BoardFilters = {
  queue: TicketQueue | "all" | "none";
  assignee: string | "all" | "unassigned";
  priority: TicketPriority | "all";
  source: "all" | "investigation" | "manual";
  status: TicketStatus | "all";
};

export const DEFAULT_FILTERS: BoardFilters = {
  queue: "all",
  assignee: "all",
  priority: "all",
  source: "all",
  status: "all",
};

export function filterTickets(
  tickets: readonly Ticket[],
  filters: BoardFilters,
): Ticket[] {
  return tickets.filter((t) => {
    if (filters.queue === "none") {
      if (t.queue !== null) return false;
    } else if (filters.queue !== "all" && t.queue !== filters.queue) {
      return false;
    }
    if (filters.assignee === "unassigned") {
      if (t.assignee !== null) return false;
    } else if (filters.assignee !== "all" && t.assignee !== filters.assignee) {
      return false;
    }
    if (filters.priority !== "all" && t.priority !== filters.priority) {
      return false;
    }
    if (filters.source === "manual" && t.source !== "manual") return false;
    if (filters.source === "investigation" && t.source === "manual") return false;
    if (filters.status !== "all" && t.status !== filters.status) return false;
    return true;
  });
}
