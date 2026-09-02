import {
  QUEUE_IDS,
  QUEUE_PREFIX,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TRIAGE_PREFIX,
  type TicketPriority,
  type TicketQueue,
  type TicketStatus,
} from "../schema/ticket";

const PRIORITY_FROM_LEGACY: Record<string, TicketPriority> = {
  P1: "URGENT",
  P2: "HIGH",
  P3: "MEDIUM",
  P4: "LOW",
};

function isStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

function isQueue(value: unknown): value is TicketQueue {
  return typeof value === "string" && (QUEUE_IDS as readonly string[]).includes(value);
}

/** Schema rename, not an operator act. ASSIGNED → TODO; ON_DECK splits on queue. */
export function migrateStatus(
  status: string,
  queue: TicketQueue | null,
): TicketStatus {
  if (status === "ASSIGNED") return "TODO";
  if (status === "ON_DECK") return queue === null ? "TRIAGE" : "BACKLOG";
  if (isStatus(status)) return status;
  return status as TicketStatus;
}

export function migratePriority(priority: string): TicketPriority {
  if (priority in PRIORITY_FROM_LEGACY) return PRIORITY_FROM_LEGACY[priority]!;
  if (isPriority(priority)) return priority;
  return priority as TicketPriority;
}

function migrateActivityToken(
  value: string | null,
  queue: TicketQueue | null,
): string | null {
  if (value === null) return null;
  if (value === "ASSIGNED" || value === "ON_DECK") {
    return migrateStatus(value, queue);
  }
  if (value in PRIORITY_FROM_LEGACY) return migratePriority(value);
  return value;
}

/**
 * One-release reader for stale localStorage (and committed artefacts
 * written before the eight-state rename). Does not append activity.
 */
export function migrateTicketRecord(row: unknown): unknown {
  if (!row || typeof row !== "object") return row;
  const ticket = { ...(row as Record<string, unknown>) };
  const queue = isQueue(ticket.queue) ? ticket.queue : null;
  if (typeof ticket.status === "string") {
    ticket.status = migrateStatus(ticket.status, queue);
  }
  if (typeof ticket.priority === "string") {
    ticket.priority = migratePriority(ticket.priority);
  }
  if (Array.isArray(ticket.activity)) {
    ticket.activity = ticket.activity.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const row = { ...(entry as Record<string, unknown>) };
      if (row.from === undefined || row.to === undefined) return row;
      const from = typeof row.from === "string" || row.from === null ? row.from : null;
      const to = typeof row.to === "string" || row.to === null ? row.to : null;
      return {
        ...row,
        from: migrateActivityToken(from, queue),
        to: migrateActivityToken(to, queue),
      };
    });
  }
  return ticket;
}

function idPrefix(queue: TicketQueue | null): string {
  return queue === null ? TRIAGE_PREFIX : QUEUE_PREFIX[queue];
}

/**
 * TCK-n → queue-prefixed ids, allocated in artefact order per prefix.
 * A later queue change does not rewrite an already-prefixed id.
 */
export function migrateTicketIds(rows: unknown[]): unknown[] {
  const nextByPrefix = new Map<string, number>();
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const ticket = { ...(row as Record<string, unknown>) };
    if (typeof ticket.ticket_id !== "string") return ticket;
    if (!/^TCK-\d+$/.test(ticket.ticket_id)) return ticket;
    const queue = isQueue(ticket.queue) ? ticket.queue : null;
    const prefix = idPrefix(queue);
    const n = (nextByPrefix.get(prefix) ?? 0) + 1;
    nextByPrefix.set(prefix, n);
    ticket.ticket_id = `${prefix}-${n}`;
    return ticket;
  });
}
