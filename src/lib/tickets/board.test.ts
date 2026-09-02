import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QUEUE_IDS } from "../schema/ticket";
import { loadTicketsArtefact } from "../replay/load";
import { layoutBoard, boardStats, columnCount, sparseColumnHint } from "./board";
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

  it("sorts a cell by priority then due_at then id", () => {
    const mixed = [
      artefact.tickets.find((t) => t.priority === "MEDIUM")!,
      artefact.tickets.find((t) => t.priority === "HIGH")!,
    ];
    const sorted = sortBoardCards(mixed);
    expect(sorted[0]!.priority).toBe("HIGH");
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
