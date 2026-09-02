import { QUEUE_IDS, type Ticket, type TicketQueue, type TicketStatus } from "../schema/ticket";

/** OPERATIONS §6. No other edges exist. */
export const LEGAL_STATUS: Record<TicketStatus, readonly TicketStatus[]> = {
  ON_DECK: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS", "ON_DECK"],
  IN_PROGRESS: ["BLOCKED", "DONE", "ASSIGNED"],
  BLOCKED: ["IN_PROGRESS", "ASSIGNED"],
  DONE: ["IN_PROGRESS"],
};

export const BOARD_COLUMNS = [
  "ASSIGNED",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export function isLegalStatusChange(
  from: TicketStatus,
  to: TicketStatus,
  queue: TicketQueue | null,
): boolean {
  if (from === to) return true;
  if (!LEGAL_STATUS[from].includes(to)) return false;
  if (to !== "ON_DECK" && queue === null) return false;
  return true;
}

export type DropTarget =
  | { kind: "rail" }
  | { kind: "column"; status: BoardColumn }
  | { kind: "cell"; status: BoardColumn; queue: TicketQueue }
  | { kind: "person"; engineerId: string; status: BoardColumn };

export type TicketPatch = {
  status?: TicketStatus;
  assignee?: string | null;
  queue?: TicketQueue | null;
  priority?: Ticket["priority"];
  note?: string;
};

/** Status / queue / assignee implied by a drop. Null when the drop is a no-op. */
export function patchForDrop(
  ticket: Ticket,
  target: DropTarget,
): TicketPatch | null {
  if (target.kind === "rail") {
    if (ticket.status === "ON_DECK" && ticket.assignee === null) return null;
    return { status: "ON_DECK", assignee: null };
  }
  if (target.kind === "column") {
    if (ticket.status === target.status) return null;
    return { status: target.status };
  }
  if (target.kind === "cell") {
    const same =
      ticket.status === target.status && ticket.queue === target.queue;
    if (same) return null;
    return { status: target.status, queue: target.queue };
  }
  const nextStatus =
    ticket.status === "ON_DECK" ? target.status : ticket.status;
  const same =
    ticket.assignee === target.engineerId && ticket.status === nextStatus;
  if (same) return null;
  return { assignee: target.engineerId, status: nextStatus };
}

export function parseDropId(id: string): DropTarget | null {
  if (id === "rail") return { kind: "rail" };
  if (id.startsWith("column:")) {
    const status = id.slice("column:".length);
    if ((BOARD_COLUMNS as readonly string[]).includes(status)) {
      return { kind: "column", status: status as BoardColumn };
    }
    return null;
  }
  if (id.startsWith("cell:")) {
    const rest = id.slice("cell:".length);
    const cut = rest.indexOf(":");
    if (cut < 0) return null;
    const status = rest.slice(0, cut);
    const queue = rest.slice(cut + 1);
    if (!(BOARD_COLUMNS as readonly string[]).includes(status)) return null;
    if (!(QUEUE_IDS as readonly string[]).includes(queue)) return null;
    return {
      kind: "cell",
      status: status as BoardColumn,
      queue: queue as TicketQueue,
    };
  }
  if (id.startsWith("person:")) {
    const rest = id.slice("person:".length);
    const cut = rest.lastIndexOf(":");
    if (cut < 0) return null;
    const engineerId = rest.slice(0, cut);
    const status = rest.slice(cut + 1);
    if (!(BOARD_COLUMNS as readonly string[]).includes(status)) return null;
    return {
      kind: "person",
      engineerId,
      status: status as BoardColumn,
    };
  }
  return null;
}
