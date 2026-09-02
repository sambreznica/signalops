import { ticketSchema, type Ticket } from "../schema/ticket";
import { migrateTicketIds, migrateTicketRecord } from "./migrate";

export const TICKETS_KEY_PREFIX = "signalops.tickets.";

export function ticketsStorageKey(runId: string): string {
  return `${TICKETS_KEY_PREFIX}${runId}`;
}

export type TicketBucket = { tickets: Ticket[] };

export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function memoryFallback(): Store {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

export function browserStore(): Store {
  if (typeof localStorage === "undefined") return memoryFallback();
  return localStorage;
}

export function loadTickets(runId: string, store: Store = browserStore()): Ticket[] {
  const raw = store.getItem(ticketsStorageKey(runId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TicketBucket;
    if (!Array.isArray(parsed.tickets)) return [];
    return migrateTicketIds(parsed.tickets).flatMap((row) => {
      const result = ticketSchema.safeParse(migrateTicketRecord(row));
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function saveTickets(
  runId: string,
  tickets: readonly Ticket[],
  store: Store = browserStore(),
): void {
  const bucket: TicketBucket = { tickets: [...tickets] };
  store.setItem(ticketsStorageKey(runId), JSON.stringify(bucket));
}

export function upsertTicket(
  runId: string,
  ticket: Ticket,
  store: Store = browserStore(),
): Ticket[] {
  const current = loadTickets(runId, store);
  const next = current.filter((t) => t.ticket_id !== ticket.ticket_id);
  next.push(ticket);
  saveTickets(runId, next, store);
  return next;
}
