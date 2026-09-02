import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QUEUE_IDS } from "../schema/ticket";
import { loadTicketsArtefact } from "../replay/load";
import { layoutBoard, boardStats, columnCount } from "./board";
import { BOARD_COLUMNS } from "./legal";
import { COLUMN_EMPTY, RAIL_EMPTY } from "./labels";
import { sortBoardCards } from "./sort";
import { applyTicketChange } from "./transition";

describe("board layout", () => {
  const artefact = loadTicketsArtefact("run-board-1");
  if (!artefact) throw new Error("run-board-1 tickets missing");

  it("places the eleven committed tickets in ASSIGNED across all four queues", () => {
    const layout = layoutBoard(artefact.tickets);
    expect(artefact.tickets).toHaveLength(11);
    expect(layout.rail).toHaveLength(0);
    expect(columnCount(layout, "ASSIGNED")).toBe(11);
    expect(columnCount(layout, "IN_PROGRESS")).toBe(0);
    expect(columnCount(layout, "BLOCKED")).toBe(0);
    expect(columnCount(layout, "DONE")).toBe(0);
    for (const queue of QUEUE_IDS) {
      expect(layout.columns.ASSIGNED[queue].length).toBeGreaterThan(0);
    }
    const stats = boardStats(artefact.tickets);
    expect(stats.byStatus.ASSIGNED).toBe(11);
    expect(stats.open).toBe(11);
    expect(stats.fromInvestigation).toBe(11);
    expect(stats.manual).toBe(0);
    expect(stats.byQueue.firmware).toBeGreaterThan(0);
    expect(stats.byQueue.hardware).toBeGreaterThan(0);
    expect(stats.byQueue.product_comms).toBeGreaterThan(0);
    expect(stats.byQueue.data_telemetry).toBeGreaterThan(0);
  });

  it("keeps empty columns as explicit cells, not missing keys", () => {
    const layout = layoutBoard(artefact.tickets);
    for (const status of BOARD_COLUMNS) {
      for (const queue of QUEUE_IDS) {
        expect(Array.isArray(layout.columns[status][queue])).toBe(true);
      }
    }
    expect(COLUMN_EMPTY.ASSIGNED.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.IN_PROGRESS.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.BLOCKED.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.DONE.length).toBeGreaterThan(0);
    expect(RAIL_EMPTY).toMatch(/queue/);
  });

  it("sorts a cell by priority then due_at", () => {
    const mixed = [
      artefact.tickets.find((t) => t.priority === "P3")!,
      artefact.tickets.find((t) => t.priority === "P2")!,
    ];
    const sorted = sortBoardCards(mixed);
    expect(sorted[0]!.priority).toBe("P2");
  });
});

describe("board mutation path", () => {
  it("the Board UI calls applyDrop and applyTicketChange, not a second writer", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../app/ui/board-view.tsx"),
      "utf8",
    );
    expect(src).toContain("applyDrop");
    expect(src).toContain("applyTicketChange");
    expect(src).toContain("bulkApply");
    expect(src).toContain("createManualTicket");
  });

  it("ASSIGNED → IN_PROGRESS is one activity entry through applyTicketChange", () => {
    const artefact = loadTicketsArtefact("run-board-1");
    const ticket = artefact!.tickets[0]!;
    const result = applyTicketChange({
      ticket,
      patch: { status: "IN_PROGRESS" },
      actor: "operator",
      now: new Date(ticket.updated_at),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.activity).toHaveLength(ticket.activity.length + 1);
    const last = result.ticket.activity.at(-1);
    expect(last).toMatchObject({
      kind: "status",
      from: "ASSIGNED",
      to: "IN_PROGRESS",
      actor: "operator",
    });
    expect(ticket.activity).toHaveLength(1);
  });
});
