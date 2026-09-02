import { describe, expect, it } from "vitest";
import type { Ticket, TicketStatus } from "../schema/ticket";
import { loadTicketsArtefact } from "../replay/load";
import { loadRoster } from "../routing/fixtures";
import { layoutBoard, columnCount } from "./board";
import { engineerCapacity, swimlaneCapacity } from "./capacity";
import { LEGAL_STATUS } from "./legal";
import {
  applyTicketChange,
  bulkApply,
  createManualTicket,
} from "./transition";

const artefact = loadTicketsArtefact("run-board-1");
if (!artefact) throw new Error("run-board-1 tickets missing");

const NOW = new Date(artefact.timestamp);

function committed(id: string): Ticket {
  const row = artefact.tickets.find((t) => t.ticket_id === id);
  if (!row) throw new Error(`missing ${id}`);
  return structuredClone(row);
}

function apply(
  ticket: Ticket,
  patch: Parameters<typeof applyTicketChange>[0]["patch"],
) {
  return applyTicketChange({
    ticket,
    patch,
    actor: "operator",
    now: NOW,
  });
}

describe("operator loop — applyTicketChange", () => {
  it("ASSIGNED → IN_PROGRESS → BLOCKED → IN_PROGRESS → DONE, one activity entry per step", () => {
    let ticket = committed("TCK-0001");
    const steps: Array<{ to: TicketStatus; from: TicketStatus }> = [
      { from: "ASSIGNED", to: "IN_PROGRESS" },
      { from: "IN_PROGRESS", to: "BLOCKED" },
      { from: "BLOCKED", to: "IN_PROGRESS" },
      { from: "IN_PROGRESS", to: "DONE" },
    ];
    const startLen = ticket.activity.length;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]!;
      const result = apply(ticket, { status: step.to });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ticket.activity).toHaveLength(startLen + i + 1);
      const last = result.ticket.activity.at(-1)!;
      expect(last.kind).toBe("status");
      expect(last.from).toBe(step.from);
      expect(last.to).toBe(step.to);
      expect(last.actor).toBe("operator");
      expect(last.at).toBe(NOW.toISOString());
      ticket = result.ticket;
    }
    expect(ticket.status).toBe("DONE");
  });

  it("reassignment across engineers is one entry; status change in the same gesture is two", () => {
    const ticket = committed("TCK-0002");
    expect(ticket.assignee).toBe("eng_tomasz_kowalski");
    const reassigned = apply(ticket, { assignee: "eng_elena_varga" });
    expect(reassigned.ok).toBe(true);
    if (!reassigned.ok) return;
    expect(reassigned.ticket.activity).toHaveLength(ticket.activity.length + 1);
    expect(reassigned.ticket.activity.at(-1)).toMatchObject({
      kind: "reassigned",
      from: "eng_tomasz_kowalski",
      to: "eng_elena_varga",
      actor: "operator",
    });

    const both = apply(ticket, {
      assignee: "eng_elena_varga",
      status: "IN_PROGRESS",
    });
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    expect(both.ticket.activity).toHaveLength(ticket.activity.length + 2);
    expect(both.ticket.activity.at(-2)).toMatchObject({
      kind: "reassigned",
      from: "eng_tomasz_kowalski",
      to: "eng_elena_varga",
    });
    expect(both.ticket.activity.at(-1)).toMatchObject({
      kind: "status",
      from: "ASSIGNED",
      to: "IN_PROGRESS",
    });
  });

  it("records a queue change", () => {
    const ticket = committed("TCK-0006");
    expect(ticket.queue).toBe("hardware");
    const result = apply(ticket, { queue: "firmware" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.queue).toBe("firmware");
    expect(result.ticket.activity.at(-1)).toMatchObject({
      kind: "queue",
      from: "hardware",
      to: "firmware",
      actor: "operator",
    });
  });

  it("reopens DONE → IN_PROGRESS", () => {
    const started = apply(committed("TCK-0001"), { status: "IN_PROGRESS" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const done = apply(started.ticket, { status: "DONE" });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const reopened = apply(done.ticket, { status: "IN_PROGRESS" });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.ticket.status).toBe("IN_PROGRESS");
    expect(reopened.ticket.activity.at(-1)).toMatchObject({
      kind: "status",
      from: "DONE",
      to: "IN_PROGRESS",
      actor: "operator",
    });
  });

  it("refuses every illegal OPERATIONS §6 edge and does not mutate", () => {
    const assigned = committed("TCK-0001");
    const inProgress = apply(assigned, { status: "IN_PROGRESS" });
    expect(inProgress.ok).toBe(true);
    if (!inProgress.ok) return;
    const done = apply(inProgress.ticket, { status: "DONE" });
    expect(done.ok).toBe(true);
    if (!done.ok) return;

    const manual = createManualTicket({
      title: "Untyped intake",
      body: "No queue yet.",
      queue: null,
      assignee: null,
      priority: "P3",
      existing: artefact.tickets,
      now: NOW,
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok || !manual.ticket) return;
    expect(manual.ticket.status).toBe("ON_DECK");
    expect(manual.ticket.queue).toBeNull();

    const cases: Array<{ ticket: Ticket; to: TicketStatus; why: string }> = [
      { ticket: manual.ticket, to: "DONE", why: "ON_DECK → DONE" },
      { ticket: manual.ticket, to: "BLOCKED", why: "ON_DECK → BLOCKED" },
      {
        ticket: manual.ticket,
        to: "IN_PROGRESS",
        why: "ON_DECK → IN_PROGRESS",
      },
      {
        ticket: manual.ticket,
        to: "ASSIGNED",
        why: "ON_DECK → ASSIGNED while queue is null",
      },
      { ticket: done.ticket, to: "ON_DECK", why: "DONE → ON_DECK" },
      { ticket: done.ticket, to: "BLOCKED", why: "DONE → BLOCKED" },
      { ticket: done.ticket, to: "ASSIGNED", why: "DONE → ASSIGNED" },
    ];

    for (const row of cases) {
      const before = structuredClone(row.ticket);
      const result = apply(row.ticket, { status: row.to });
      expect(result.ok, row.why).toBe(false);
      expect(result.ticket).toEqual(before);
      expect(row.ticket).toEqual(before);
    }

    const legalFromDone = LEGAL_STATUS.DONE;
    expect(legalFromDone).toEqual(["IN_PROGRESS"]);
  });

  it("lands a manual ticket with no queue on ON_DECK and refuses promotion until a queue is set", () => {
    const created = createManualTicket({
      title: "Manual intake",
      body: "Operator typed this.",
      queue: null,
      assignee: "eng_priya_nair",
      priority: "P3",
      existing: artefact.tickets,
      now: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.ticket) return;
    expect(created.ticket.status).toBe("ON_DECK");
    expect(created.ticket.queue).toBeNull();
    expect(created.ticket.assignee).toBeNull();
    expect(created.ticket.source).toBe("manual");
    expect(created.ticket.activity[0]).toMatchObject({
      kind: "created",
      to: "ON_DECK",
      actor: "operator",
    });

    const refused = apply(created.ticket, {
      status: "ASSIGNED",
      assignee: "eng_priya_nair",
    });
    expect(refused.ok).toBe(false);
    expect(refused.ticket).toEqual(created.ticket);

    const queued = apply(created.ticket, { queue: "firmware" });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    const promoted = apply(queued.ticket, {
      status: "ASSIGNED",
      assignee: "eng_priya_nair",
    });
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    expect(promoted.ticket.status).toBe("ASSIGNED");
    expect(promoted.ticket.queue).toBe("firmware");
  });

  it("appends a note and an activity entry together", () => {
    const ticket = committed("TCK-0007");
    const result = apply(ticket, { note: "Checked the copy against KD-05." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.notes).toHaveLength(1);
    expect(result.ticket.notes[0]).toMatchObject({
      author: "operator",
      body: "Checked the copy against KD-05.",
      at: NOW.toISOString(),
    });
    expect(result.ticket.activity.at(-1)).toMatchObject({
      kind: "note",
      from: null,
      to: "Checked the copy against KD-05.",
      actor: "operator",
    });
  });

  it("bulk status over three ids writes three entries and skips an illegal id", () => {
    const tickets = artefact.tickets.map((t) => structuredClone(t));
    const ids = ["TCK-0004", "TCK-0005", "TCK-0006", "TCK-9999"];
    const result = bulkApply({
      tickets,
      ids,
      patch: { status: "IN_PROGRESS" },
      actor: "operator",
      now: NOW,
    });
    expect(result.applied).toBe(3);
    expect(result.skipped).toBe(1);
    for (const id of ["TCK-0004", "TCK-0005", "TCK-0006"]) {
      const row = result.tickets.find((t) => t.ticket_id === id)!;
      expect(row.status).toBe("IN_PROGRESS");
      expect(row.activity.at(-1)).toMatchObject({
        kind: "status",
        from: "ASSIGNED",
        to: "IN_PROGRESS",
        actor: "operator",
      });
    }
    expect(result.tickets.find((t) => t.ticket_id === "TCK-9999")).toBeUndefined();
  });

  it("a third ticket onto an engineer at cap succeeds and capacity reports over rather than blocking", () => {
    const roster = loadRoster();
    const tickets = artefact.tickets.map((t) => structuredClone(t));
    const priya = engineerCapacity("eng_priya_nair", tickets, roster);
    expect(priya.used).toBe(priya.limit);
    expect(priya.over).toBe(false);

    const extra = tickets.find((t) => t.ticket_id === "TCK-0002")!;
    const result = apply(extra, { assignee: "eng_priya_nair" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = tickets.map((t) =>
      t.ticket_id === extra.ticket_id ? result.ticket : t,
    );
    const priyaAfter = engineerCapacity("eng_priya_nair", next, roster);
    expect(priyaAfter.used).toBe(priya.limit + 1);
    expect(priyaAfter.over).toBe(true);

    const hannah = engineerCapacity("eng_hannah_briggs", next, roster);
    expect(hannah.used).toBe(hannah.limit);
    const overflow = next.find((t) => t.ticket_id === "TCK-0006")!;
    const moved = apply(overflow, {
      queue: "product_comms",
      assignee: "eng_hannah_briggs",
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const overflowed = next.map((t) =>
      t.ticket_id === overflow.ticket_id ? moved.ticket : t,
    );
    expect(
      swimlaneCapacity("product_comms", overflowed, roster).over,
    ).toBe(true);
  });
});

describe("board fixture — every column and the rail reachable", () => {
  it("after legal transitions, ASSIGNED, IN_PROGRESS, BLOCKED, DONE and the rail each hold a card", () => {
    let tickets = artefact.tickets.map((t) => structuredClone(t));

    function replace(next: Ticket) {
      tickets = tickets.map((t) =>
        t.ticket_id === next.ticket_id ? next : t,
      );
    }

    const t1 = apply(tickets[0]!, { status: "IN_PROGRESS" });
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;
    replace(t1.ticket);

    const t2a = apply(
      tickets.find((t) => t.ticket_id === "TCK-0002")!,
      { status: "IN_PROGRESS" },
    );
    expect(t2a.ok).toBe(true);
    if (!t2a.ok) return;
    const t2b = apply(t2a.ticket, { status: "BLOCKED" });
    expect(t2b.ok).toBe(true);
    if (!t2b.ok) return;
    replace(t2b.ticket);

    const t3a = apply(
      tickets.find((t) => t.ticket_id === "TCK-0003")!,
      { status: "IN_PROGRESS" },
    );
    expect(t3a.ok).toBe(true);
    if (!t3a.ok) return;
    const t3b = apply(t3a.ticket, { status: "DONE" });
    expect(t3b.ok).toBe(true);
    if (!t3b.ok) return;
    replace(t3b.ticket);

    const t4 = apply(
      tickets.find((t) => t.ticket_id === "TCK-0004")!,
      { status: "ON_DECK" },
    );
    expect(t4.ok).toBe(true);
    if (!t4.ok) return;
    replace(t4.ticket);

    const manual = createManualTicket({
      title: "Unqueued intake",
      body: "Stays on the rail until a queue is set.",
      queue: null,
      assignee: null,
      priority: "P3",
      existing: tickets,
      now: NOW,
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok || !manual.ticket) return;
    tickets = [...tickets, manual.ticket];

    const layout = layoutBoard(tickets);
    expect(layout.rail.length).toBeGreaterThan(0);
    expect(columnCount(layout, "ASSIGNED")).toBeGreaterThan(0);
    expect(columnCount(layout, "IN_PROGRESS")).toBeGreaterThan(0);
    expect(columnCount(layout, "BLOCKED")).toBeGreaterThan(0);
    expect(columnCount(layout, "DONE")).toBeGreaterThan(0);
  });
});
