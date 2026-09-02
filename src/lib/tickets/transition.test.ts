import { describe, expect, it } from "vitest";
import type { Ticket, TicketStatus } from "../schema/ticket";
import { TICKET_STATUSES } from "../schema/ticket";
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
  it("TODO → IN_PROGRESS → IN_REVIEW → DONE, one activity entry per step", () => {
    let ticket = committed("FW-1");
    const steps: Array<{ to: TicketStatus; from: TicketStatus }> = [
      { from: "TODO", to: "IN_PROGRESS" },
      { from: "IN_PROGRESS", to: "IN_REVIEW" },
      { from: "IN_REVIEW", to: "DONE" },
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
      ticket = result.ticket;
    }
    expect(ticket.status).toBe("DONE");
  });

  it("IN_PROGRESS → BLOCKED frees WIP; BLOCKED → DONE is illegal", () => {
    const started = apply(committed("FW-1"), { status: "IN_PROGRESS" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const blocked = apply(started.ticket, { status: "BLOCKED" });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.ticket.status).toBe("BLOCKED");
    const toDone = apply(blocked.ticket, { status: "DONE" });
    expect(toDone.ok).toBe(false);
    expect(toDone.ticket).toEqual(blocked.ticket);
    const resumed = apply(blocked.ticket, { status: "IN_PROGRESS" });
    expect(resumed.ok).toBe(true);
  });

  it("CANCELLED → TODO is operator-only, logged, and refuses if occupancy is missing", () => {
    const cancelled = apply(committed("FW-1"), { status: "CANCELLED" });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.ticket.queue).toBe("firmware");
    expect(cancelled.ticket.assignee).toBe("eng_priya_nair");
    const reopened = apply(cancelled.ticket, { status: "TODO" });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.ticket.status).toBe("TODO");
    expect(reopened.ticket.activity.at(-1)).toMatchObject({
      kind: "status",
      from: "CANCELLED",
      to: "TODO",
      actor: "operator",
    });
    expect(LEGAL_STATUS.CANCELLED).toEqual(["TODO"]);

    const orphan = {
      ...cancelled.ticket,
      assignee: null,
    };
    const refused = apply(orphan as Ticket, { status: "TODO" });
    expect(refused.ok).toBe(false);
  });

  it("reassignment across engineers is one entry; status change in the same gesture is two", () => {
    const ticket = committed("FW-2");
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
      from: "TODO",
      to: "IN_PROGRESS",
    });
  });

  it("records a queue change", () => {
    const ticket = committed("HW-3");
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
    const started = apply(committed("FW-1"), { status: "IN_PROGRESS" });
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
    const assigned = committed("FW-1");
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
      priority: "MEDIUM",
      existing: artefact.tickets,
      now: NOW,
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok || !manual.ticket) return;
    expect(manual.ticket.status).toBe("TRIAGE");
    expect(manual.ticket.queue).toBeNull();

    const cases: Array<{ ticket: Ticket; to: TicketStatus; why: string }> = [
      { ticket: manual.ticket, to: "DONE", why: "TRIAGE → DONE" },
      { ticket: manual.ticket, to: "BLOCKED", why: "TRIAGE → BLOCKED" },
      {
        ticket: manual.ticket,
        to: "IN_PROGRESS",
        why: "TRIAGE → IN_PROGRESS",
      },
      {
        ticket: manual.ticket,
        to: "TODO",
        why: "TRIAGE → TODO while queue is null",
      },
      { ticket: done.ticket, to: "TRIAGE", why: "DONE → TRIAGE" },
      { ticket: done.ticket, to: "BLOCKED", why: "DONE → BLOCKED" },
      { ticket: done.ticket, to: "TODO", why: "DONE → TODO" },
      { ticket: done.ticket, to: "BACKLOG", why: "DONE → BACKLOG" },
    ];

    for (const row of cases) {
      const before = structuredClone(row.ticket);
      const result = apply(row.ticket, { status: row.to });
      expect(result.ok, row.why).toBe(false);
      expect(result.ticket).toEqual(before);
      expect(row.ticket).toEqual(before);
    }

    expect(LEGAL_STATUS.DONE).toEqual(["IN_PROGRESS"]);
    expect(LEGAL_STATUS.BLOCKED).not.toContain("DONE");
  });

  it("lands a manual ticket with no queue on TRIAGE and refuses promotion until a queue is set", () => {
    const created = createManualTicket({
      title: "Manual intake",
      body: "Operator typed this.",
      queue: null,
      assignee: "eng_priya_nair",
      priority: "MEDIUM",
      existing: artefact.tickets,
      now: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.ticket) return;
    expect(created.ticket.status).toBe("TRIAGE");
    expect(created.ticket.queue).toBeNull();
    expect(created.ticket.assignee).toBeNull();
    expect(created.ticket.source).toBe("manual");
    expect(created.ticket.activity[0]).toMatchObject({
      kind: "created",
      to: "TRIAGE",
      actor: "operator",
    });

    const refused = apply(created.ticket, {
      status: "TODO",
      assignee: "eng_priya_nair",
    });
    expect(refused.ok).toBe(false);
    expect(refused.ticket).toEqual(created.ticket);

    const queued = apply(created.ticket, { queue: "firmware" });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(queued.ticket.status).toBe("BACKLOG");
    const promoted = apply(queued.ticket, {
      status: "TODO",
      assignee: "eng_priya_nair",
    });
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    expect(promoted.ticket.status).toBe("TODO");
    expect(promoted.ticket.queue).toBe("firmware");
  });

  it("appends a note and an activity entry together", () => {
    const ticket = committed("PC-1");
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
    const ids = ["HW-1", "HW-2", "HW-3", "FW-9999"];
    const result = bulkApply({
      tickets,
      ids,
      patch: { status: "IN_PROGRESS" },
      actor: "operator",
      now: NOW,
    });
    expect(result.applied).toBe(3);
    expect(result.skipped).toBe(1);
    for (const id of ["HW-1", "HW-2", "HW-3"]) {
      const row = result.tickets.find((t) => t.ticket_id === id)!;
      expect(row.status).toBe("IN_PROGRESS");
      expect(row.activity.at(-1)).toMatchObject({
        kind: "status",
        from: "TODO",
        to: "IN_PROGRESS",
        actor: "operator",
      });
    }
    expect(result.tickets.find((t) => t.ticket_id === "FW-9999")).toBeUndefined();
  });

  it("a third ticket onto an engineer at cap succeeds and capacity reports over rather than blocking", () => {
    const roster = loadRoster();
    const tickets = artefact.tickets.map((t) => structuredClone(t));
    const priya = engineerCapacity("eng_priya_nair", tickets, roster);
    expect(priya.used).toBe(priya.limit);
    expect(priya.over).toBe(false);

    const extra = tickets.find((t) => t.ticket_id === "FW-2")!;
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
    const overflow = next.find((t) => t.ticket_id === "HW-3")!;
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
  it("after legal transitions, every status holds a card", () => {
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
      tickets.find((t) => t.ticket_id === "FW-2")!,
      { status: "IN_PROGRESS" },
    );
    expect(t2a.ok).toBe(true);
    if (!t2a.ok) return;
    const t2b = apply(t2a.ticket, { status: "IN_REVIEW" });
    expect(t2b.ok).toBe(true);
    if (!t2b.ok) return;
    replace(t2b.ticket);

    const t3a = apply(
      tickets.find((t) => t.ticket_id === "FW-3")!,
      { status: "IN_PROGRESS" },
    );
    expect(t3a.ok).toBe(true);
    if (!t3a.ok) return;
    const t3b = apply(t3a.ticket, { status: "BLOCKED" });
    expect(t3b.ok).toBe(true);
    if (!t3b.ok) return;
    replace(t3b.ticket);

    const t4a = apply(
      tickets.find((t) => t.ticket_id === "HW-1")!,
      { status: "IN_PROGRESS" },
    );
    expect(t4a.ok).toBe(true);
    if (!t4a.ok) return;
    const t4b = apply(t4a.ticket, { status: "DONE" });
    expect(t4b.ok).toBe(true);
    if (!t4b.ok) return;
    replace(t4b.ticket);

    const t5 = apply(
      tickets.find((t) => t.ticket_id === "HW-2")!,
      { status: "CANCELLED" },
    );
    expect(t5.ok).toBe(true);
    if (!t5.ok) return;
    replace(t5.ticket);

    const t6 = apply(
      tickets.find((t) => t.ticket_id === "HW-3")!,
      { status: "BACKLOG" },
    );
    expect(t6.ok).toBe(true);
    if (!t6.ok) return;
    replace(t6.ticket);

    const manual = createManualTicket({
      title: "Unqueued intake",
      body: "Stays on the rail until a queue is set.",
      queue: null,
      assignee: null,
      priority: "MEDIUM",
      existing: tickets,
      now: NOW,
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok || !manual.ticket) return;
    tickets = [...tickets, manual.ticket];

    const layout = layoutBoard(tickets);
    expect(layout.rail.length).toBeGreaterThan(0);
    expect(columnCount(layout, "TODO")).toBeGreaterThan(0);
    expect(columnCount(layout, "IN_PROGRESS")).toBeGreaterThan(0);
    expect(columnCount(layout, "IN_REVIEW")).toBeGreaterThan(0);
    expect(columnCount(layout, "BLOCKED")).toBeGreaterThan(0);
    expect(columnCount(layout, "DONE")).toBeGreaterThan(0);
    expect(columnCount(layout, "CANCELLED")).toBeGreaterThan(0);
    expect(new Set(tickets.map((t) => t.status)).size).toBe(
      TICKET_STATUSES.length,
    );
  });
});
