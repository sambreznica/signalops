import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QUEUE_IDS } from "../schema/ticket";
import { loadTicketsArtefact } from "../replay/load";
import { layoutBoard, boardStats, columnCount, sparseColumnHint, visibleBoardColumns } from "./board";
import { BOARD_COLUMNS } from "./legal";
import { COLUMN_EMPTY, RAIL_EMPTY } from "./labels";
import { sortBoardCards } from "./sort";
import { applyTicketChange } from "./transition";
import { migrateTicketRecord } from "./migrate";

describe("board layout", () => {
  const artefact = loadTicketsArtefact("run-board-1");
  if (!artefact) throw new Error("run-board-1 tickets missing");

  it("places the eleven committed tickets in TODO across all four queues", () => {
    const layout = layoutBoard(artefact.tickets);
    expect(artefact.tickets).toHaveLength(11);
    expect(layout.rail).toHaveLength(0);
    expect(columnCount(layout, "TODO")).toBe(11);
    expect(columnCount(layout, "IN_PROGRESS")).toBe(0);
    expect(columnCount(layout, "BLOCKED")).toBe(0);
    expect(columnCount(layout, "DONE")).toBe(0);
    for (const queue of QUEUE_IDS) {
      expect(layout.columns.TODO[queue].length).toBeGreaterThan(0);
    }
    const stats = boardStats(artefact.tickets);
    expect(stats.byStatus.TODO).toBe(11);
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
    expect(COLUMN_EMPTY.TODO.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.IN_PROGRESS.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.IN_REVIEW.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.BLOCKED.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.DONE.length).toBeGreaterThan(0);
    expect(COLUMN_EMPTY.CANCELLED.length).toBeGreaterThan(0);
    expect(RAIL_EMPTY).toMatch(/queue/);
  });

  it("sorts each TODO cell by priority, then due_at, then id", () => {
    const layout = layoutBoard(artefact.tickets);
    for (const queue of QUEUE_IDS) {
      const cell = layout.columns.TODO[queue];
      expect(cell.map((t) => t.ticket_id)).toEqual(
        sortBoardCards(cell).map((t) => t.ticket_id),
      );
    }
    const pc = layout.columns.TODO.product_comms;
    expect(pc[0]!.ticket_id).toBe("PC-3");
    expect(pc[0]!.priority).toBe("HIGH");
  });

  it("fires the sparse-column hint on first load when all eleven sit in TODO", () => {
    const hint = sparseColumnHint(artefact.tickets);
    expect(hint).not.toBeNull();
    expect(hint!.status).toBe("TODO");
    expect(hint!.share).toBe(1);
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../app/ui/board-view.tsx"),
      "utf8",
    );
    expect(src).toContain("sparseColumnHint");
    expect(src).toContain("groupBy");
  });

  it("collapses the TODO column when it is empty and keeps the others", () => {
    const layout = layoutBoard(artefact.tickets);
    expect(visibleBoardColumns(layout)).toContain("TODO");
    const emptyTodo = layoutBoard(
      artefact.tickets.map((t) => ({ ...t, status: "IN_PROGRESS" as const })),
    );
    expect(visibleBoardColumns(emptyTodo)).not.toContain("TODO");
    expect(visibleBoardColumns(emptyTodo)).toContain("IN_PROGRESS");
    expect(visibleBoardColumns(emptyTodo)).toContain("CANCELLED");
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
    expect(src).toContain("sparseColumnHint");
    expect(src).toContain("visibleBoardColumns");
  });

  it("undo is a compensating applyTicketChange, not a rewind of activity", () => {
    const artefact = loadTicketsArtefact("run-board-1");
    const ticket = artefact!.tickets[0]!;
    const forward = applyTicketChange({
      ticket,
      patch: { status: "IN_PROGRESS" },
      actor: "operator",
      now: new Date(ticket.updated_at),
    });
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    const undone = applyTicketChange({
      ticket: forward.ticket,
      patch: { status: ticket.status },
      actor: "operator",
      now: new Date(ticket.updated_at),
    });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.ticket.status).toBe("TODO");
    expect(undone.ticket.activity.length).toBe(ticket.activity.length + 2);
    expect(undone.ticket.activity.at(-1)).toMatchObject({
      kind: "status",
      from: "IN_PROGRESS",
      to: "TODO",
      actor: "operator",
    });
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../app/ui/board-view.tsx"),
      "utf8",
    );
    expect(src).toContain("lastUndo");
    expect(src).toContain("applyTicketChange");
  });

  it("TODO → IN_PROGRESS is one activity entry through applyTicketChange", () => {
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
      from: "TODO",
      to: "IN_PROGRESS",
      actor: "operator",
    });
    expect(ticket.activity).toHaveLength(1);
  });
});

describe("lifecycle migration", () => {
  it("remaps ASSIGNED to TODO without appending activity", () => {
    const migrated = migrateTicketRecord({
      ticket_id: "TCK-0001",
      status: "ASSIGNED",
      priority: "P3",
      queue: "firmware",
      assignee: "eng_priya_nair",
      activity: [
        { kind: "created", from: null, to: "ASSIGNED", actor: "routing", at: "x" },
      ],
    }) as { status: string; priority: string; activity: Array<{ to: string }> };
    expect(migrated.status).toBe("TODO");
    expect(migrated.priority).toBe("MEDIUM");
    expect(migrated.activity).toHaveLength(1);
    expect(migrated.activity[0]!.to).toBe("TODO");
  });
});
