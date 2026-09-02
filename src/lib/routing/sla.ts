import type { TicketPriority } from "../schema/ticket";

const SLA_MS: Record<TicketPriority, number> = {
  URGENT: 4 * 60 * 60 * 1000,
  HIGH: 1 * 24 * 60 * 60 * 1000,
  MEDIUM: 3 * 24 * 60 * 60 * 1000,
  LOW: 7 * 24 * 60 * 60 * 1000,
};

export function dueAt(created: Date, priority: TicketPriority): Date {
  return new Date(created.getTime() + SLA_MS[priority]);
}
