import type { TicketQueue, TicketStatus } from "../schema/ticket";
import type { BoardColumn } from "./legal";

export const QUEUE_LABEL: Record<TicketQueue, string> = {
  firmware: "Firmware",
  hardware: "Hardware",
  product_comms: "Product Comms",
  data_telemetry: "Data & Telemetry",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  TRIAGE: "Triage",
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const COLUMN_EMPTY: Record<BoardColumn, string> = {
  TODO: "Owned work that has not started belongs here.",
  IN_PROGRESS: "Work underway belongs here.",
  IN_REVIEW: "Work awaiting verification belongs here.",
  BLOCKED: "Work that cannot proceed belongs here. The due date does not pause.",
  DONE: "Finished work belongs here.",
  CANCELLED: "Dropped work belongs here. Grey, never red.",
};

export const RAIL_EMPTY =
  "Unowned work sits here. A ticket without a queue cannot leave the rail.";

export const RAIL_LABEL = "Triage & backlog";
