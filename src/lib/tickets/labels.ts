import type { TicketQueue, TicketStatus } from "../schema/ticket";
import type { BoardColumn } from "./legal";

export const QUEUE_LABEL: Record<TicketQueue, string> = {
  firmware: "Firmware",
  hardware: "Hardware",
  product_comms: "Product Comms",
  data_telemetry: "Data & Telemetry",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  ON_DECK: "On deck",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

export const COLUMN_EMPTY: Record<BoardColumn, string> = {
  ASSIGNED: "Owned work that has not started belongs here.",
  IN_PROGRESS: "Work underway belongs here.",
  BLOCKED: "Work that cannot proceed belongs here. The due date does not pause.",
  DONE: "Finished work belongs here.",
};

export const RAIL_EMPTY =
  "Unowned work sits here. A ticket without a queue cannot leave the rail.";

export const RAIL_LABEL = "On deck";
