import {
  QUEUE_IDS,
  RAIL_STATUSES,
  type Ticket,
  type TicketQueue,
  type TicketStatus,
} from "../schema/ticket";

/** OPERATIONS §6. No other edges exist. */
export const LEGAL_STATUS: Record<TicketStatus, readonly TicketStatus[]> = {
  TRIAGE: ["BACKLOG", "TODO"],
  BACKLOG: ["TRIAGE", "TODO"],
  TODO: ["IN_PROGRESS", "BACKLOG", "TRIAGE", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED", "TODO", "DONE", "CANCELLED"],
  IN_REVIEW: ["DONE", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "IN_REVIEW", "TODO"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["TODO"],
};

export const BOARD_COLUMNS = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export function isRailStatus(status: TicketStatus): boolean {
  return (RAIL_STATUSES as readonly TicketStatus[]).includes(status);
}

export function isLegalStatusChange(
  from: TicketStatus,
  to: TicketStatus,
  queue: TicketQueue | null,
  assignee: string | null,
): boolean {
  if (from === to) return true;
  if (!LEGAL_STATUS[from].includes(to)) return false;
  if (to === "TRIAGE") return true;
  if (to === "BACKLOG") return queue !== null;
  if (to === "TODO") return queue !== null && assignee !== null;
  if (to === "CANCELLED") return true;
  return queue !== null && assignee !== null;
}

export type DropTarget =
  | { kind: "rail" }
  | { kind: "column"; status: BoardColumn }
  | { kind: "cell"; status: BoardColumn; queue: TicketQueue }
  | {
      kind: "person";
      engineerId: string;
      status: BoardColumn;
      queue?: TicketQueue;
    };

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
    if (isRailStatus(ticket.status) && ticket.assignee === null) return null;
    if (ticket.queue === null) return { status: "TRIAGE", assignee: null };
    return { status: "BACKLOG", assignee: null };
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
  const fromRail = isRailStatus(ticket.status);
  const nextStatus: TicketStatus = fromRail ? "TODO" : ticket.status;
  const nextQueue = fromRail
    ? (target.queue ?? ticket.queue)
    : ticket.queue;
  const same =
    ticket.assignee === target.engineerId &&
    ticket.status === nextStatus &&
    ticket.queue === nextQueue;
  if (same) return null;
  const patch: TicketPatch = {
    assignee: target.engineerId,
    status: nextStatus,
  };
  if (nextQueue !== ticket.queue) patch.queue = nextQueue;
  return patch;
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
    const parts = rest.split(":");
    if (parts.length < 2) return null;
    const engineerId = parts[0]!;
    const status = parts[1]!;
    const queue = parts[2];
    if (!(BOARD_COLUMNS as readonly string[]).includes(status)) return null;
    if (queue !== undefined && !(QUEUE_IDS as readonly string[]).includes(queue)) {
      return null;
    }
    return {
      kind: "person",
      engineerId,
      status: status as BoardColumn,
      queue: queue as TicketQueue | undefined,
    };
  }
  return null;
}
