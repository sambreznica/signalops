import type { TicketPriority } from "../schema/ticket";

const SLA_MS: Record<TicketPriority, number> = {
  P1: 4 * 60 * 60 * 1000,
  P2: 24 * 60 * 60 * 1000,
  P3: 72 * 60 * 60 * 1000,
  P4: 168 * 60 * 60 * 1000,
};

export function dueAt(created: Date, priority: TicketPriority): Date {
  return new Date(created.getTime() + SLA_MS[priority]);
}
