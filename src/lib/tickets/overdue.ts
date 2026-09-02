import type { Ticket } from "../schema/ticket";

/** OPERATIONS §5. DONE and CANCELLED are still late if they finished after due_at; the tint is for open work. */
export function isOverdue(ticket: Ticket, now: Date): boolean {
  if (ticket.status === "DONE" || ticket.status === "CANCELLED") return false;
  return now.getTime() > new Date(ticket.due_at).getTime();
}

export function ageMs(ticket: Ticket, now: Date): number {
  return Math.max(0, now.getTime() - new Date(ticket.created_at).getTime());
}

export function ageLabel(ticket: Ticket, now: Date): string {
  const ms = ageMs(ticket, now);
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
