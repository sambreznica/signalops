import {
  QUEUE_IDS,
  TICKET_STATUSES,
  type Ticket,
  type TicketQueue,
  type TicketStatus,
} from "../schema/ticket";
import { BOARD_COLUMNS, isRailStatus, type BoardColumn } from "./legal";
import { sortBoardCards } from "./sort";

export type BoardLayout = {
  rail: Ticket[];
  columns: Record<BoardColumn, Record<TicketQueue, Ticket[]>>;
};

export function layoutBoard(tickets: readonly Ticket[]): BoardLayout {
  const sorted = sortBoardCards(tickets);
  const rail = sorted.filter((t) => isRailStatus(t.status));
  const columns = {} as BoardLayout["columns"];
  for (const status of BOARD_COLUMNS) {
    columns[status] = {} as Record<TicketQueue, Ticket[]>;
    for (const queue of QUEUE_IDS) {
      columns[status][queue] = sorted.filter(
        (t) => t.status === status && t.queue === queue,
      );
    }
  }
  return { rail, columns };
}

export function boardStats(tickets: readonly Ticket[]): {
  byStatus: Record<TicketStatus, number>;
  byQueue: Record<TicketQueue | "none", number>;
  open: number;
  fromInvestigation: number;
  manual: number;
} {
  const byStatus = Object.fromEntries(
    TICKET_STATUSES.map((s) => [s, 0]),
  ) as Record<TicketStatus, number>;
  const byQueue: Record<TicketQueue | "none", number> = {
    firmware: 0,
    hardware: 0,
    product_comms: 0,
    data_telemetry: 0,
    none: 0,
  };
  let fromInvestigation = 0;
  let manual = 0;
  for (const t of tickets) {
    byStatus[t.status] += 1;
    if (t.queue === null) byQueue.none += 1;
    else byQueue[t.queue] += 1;
    if (t.source === "manual") manual += 1;
    else fromInvestigation += 1;
  }
  return {
    byStatus,
    byQueue,
    open: tickets.length - byStatus.DONE - byStatus.CANCELLED,
    fromInvestigation,
    manual,
  };
}

export function columnCount(
  layout: BoardLayout,
  status: BoardColumn,
): number {
  return QUEUE_IDS.reduce((n, q) => n + layout.columns[status][q].length, 0);
}

/** Quiet hint when one column holds more than 70% of visible tickets. */
export function sparseColumnHint(
  tickets: readonly Ticket[],
): { status: BoardColumn; share: number } | null {
  if (tickets.length === 0) return null;
  let top: BoardColumn | null = null;
  let topCount = 0;
  for (const status of BOARD_COLUMNS) {
    const n = tickets.filter((t) => t.status === status).length;
    if (n > topCount) {
      top = status;
      topCount = n;
    }
  }
  if (!top || topCount / tickets.length <= 0.7) return null;
  return { status: top, share: topCount / tickets.length };
}
