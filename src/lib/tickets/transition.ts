import {
  ENGINEER_ID_RE,
  ticketSchema,
  type Ticket,
  type TicketPriority,
  type TicketQueue,
  type TicketStatus,
} from "../schema/ticket";
import { nextTicketId } from "../routing/route";
import { dueAt } from "../routing/sla";
import {
  isLegalStatusChange,
  patchForDrop,
  type DropTarget,
  type TicketPatch,
} from "./legal";

export type { TicketPatch } from "./legal";
export type { DropTarget } from "./legal";

export type TicketActor = Ticket["activity"][number]["actor"];

export type ApplyResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: string; ticket: Ticket };

function stamp(
  ticket: Ticket,
  kind: Ticket["activity"][number]["kind"],
  from: string | null,
  to: string | null,
  actor: TicketActor,
  at: string,
): void {
  ticket.activity.push({ kind, from, to, actor, at });
  ticket.updated_at = at;
}

/**
 * The only mutation path. Every status change, reassignment, queue change,
 * priority change and note appends activity[]. Drag, bulk, keyboard and
 * the drawer all call this. A path that writes a ticket without it is a defect.
 */
export function applyTicketChange(args: {
  ticket: Ticket;
  patch: TicketPatch;
  actor: TicketActor;
  now: Date;
}): ApplyResult {
  const { actor } = args;
  const at = args.now.toISOString();
  const original = args.ticket;
  const patch = args.patch;

  const hasWork =
    patch.status !== undefined ||
    patch.assignee !== undefined ||
    patch.queue !== undefined ||
    patch.priority !== undefined ||
    Boolean(patch.note && patch.note.length > 0);
  if (!hasWork) return { ok: true, ticket: original };

  const next: Ticket = structuredClone(original);

  if (patch.queue !== undefined && patch.queue !== next.queue) {
    const resultingStatus = patch.status ?? next.status;
    if (patch.queue === null && resultingStatus !== "ON_DECK") {
      return {
        ok: false,
        reason: "queue may be null only while ON_DECK",
        ticket: original,
      };
    }
    stamp(next, "queue", next.queue, patch.queue, actor, at);
    next.queue = patch.queue;
  }

  if (patch.assignee !== undefined && patch.assignee !== next.assignee) {
    if (patch.assignee !== null && !ENGINEER_ID_RE.test(patch.assignee)) {
      return { ok: false, reason: "unknown assignee", ticket: original };
    }
    stamp(next, "reassigned", next.assignee, patch.assignee, actor, at);
    next.assignee = patch.assignee;
  }

  if (patch.status !== undefined && patch.status !== next.status) {
    if (!isLegalStatusChange(original.status, patch.status, next.queue)) {
      return {
        ok: false,
        reason: `illegal ${original.status} → ${patch.status}`,
        ticket: original,
      };
    }
    if (patch.status === "ON_DECK" && next.assignee !== null) {
      stamp(next, "reassigned", next.assignee, null, actor, at);
      next.assignee = null;
    }
    if (
      (patch.status === "ASSIGNED" ||
        patch.status === "IN_PROGRESS" ||
        patch.status === "BLOCKED") &&
      next.assignee === null
    ) {
      return {
        ok: false,
        reason: "owned statuses require an assignee",
        ticket: original,
      };
    }
    stamp(next, "status", original.status, patch.status, actor, at);
    next.status = patch.status;
  }

  if (next.status !== "ON_DECK" && next.queue === null) {
    return {
      ok: false,
      reason: "queue may be null only while ON_DECK",
      ticket: original,
    };
  }
  if (next.status === "ON_DECK" && next.assignee !== null) {
    return {
      ok: false,
      reason: "ON_DECK cannot have an assignee",
      ticket: original,
    };
  }

  if (patch.priority !== undefined && patch.priority !== next.priority) {
    stamp(next, "priority", next.priority, patch.priority, actor, at);
    next.priority = patch.priority;
  }

  if (patch.note !== undefined && patch.note.length > 0) {
    next.notes.push({ author: actor, body: patch.note, at });
    stamp(next, "note", null, patch.note, actor, at);
  }

  const parsed = ticketSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues[0]?.message ?? "invalid ticket",
      ticket: original,
    };
  }
  return { ok: true, ticket: parsed.data };
}

export function isDropEnabled(ticket: Ticket, target: DropTarget): boolean {
  const patch = patchForDrop(ticket, target);
  if (!patch) return false;
  return applyTicketChange({
    ticket,
    patch,
    actor: "operator",
    now: new Date(ticket.updated_at),
  }).ok;
}

export function applyDrop(args: {
  ticket: Ticket;
  target: DropTarget;
  actor: TicketActor;
  now: Date;
}): ApplyResult {
  const patch = patchForDrop(args.ticket, args.target);
  if (!patch) return { ok: false, reason: "no-op drop", ticket: args.ticket };
  return applyTicketChange({ ...args, patch });
}

export function bulkApply(args: {
  tickets: readonly Ticket[];
  ids: readonly string[];
  patch: TicketPatch;
  actor: TicketActor;
  now: Date;
}): { tickets: Ticket[]; applied: number; skipped: number } {
  const byId = new Map(args.tickets.map((t) => [t.ticket_id, t]));
  let applied = 0;
  let skipped = 0;
  for (const id of args.ids) {
    const current = byId.get(id);
    if (!current) {
      skipped += 1;
      continue;
    }
    const result = applyTicketChange({
      ticket: current,
      patch: args.patch,
      actor: args.actor,
      now: args.now,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    byId.set(id, result.ticket);
    applied += 1;
  }
  return {
    tickets: args.tickets.map((t) => byId.get(t.ticket_id) ?? t),
    applied,
    skipped,
  };
}

export function createManualTicket(args: {
  title: string;
  body: string;
  queue: TicketQueue | null;
  assignee: string | null;
  priority: TicketPriority;
  existing: readonly Ticket[];
  now: Date;
}): ApplyResult | { ok: false; reason: string; ticket: null } {
  const title = args.title.trim();
  const body = args.body.trim();
  if (title.length === 0) {
    return { ok: false, reason: "title is required", ticket: null };
  }
  const at = args.now.toISOString();
  const queue = args.queue;
  const assignee = queue === null ? null : args.assignee;
  const status: TicketStatus = assignee ? "ASSIGNED" : "ON_DECK";
  const parsed = ticketSchema.safeParse({
    ticket_id: nextTicketId(args.existing),
    title,
    body: body.length > 0 ? body : "Operator-created ticket.",
    queue,
    assignee,
    priority: args.priority,
    status,
    source: "manual",
    skills_required: [],
    routing_rationale: "Operator created this ticket. No skills assessor ran.",
    created_at: at,
    due_at: dueAt(args.now, args.priority).toISOString(),
    updated_at: at,
    notes: [],
    activity: [
      {
        kind: "created",
        from: null,
        to: status,
        actor: "operator",
        at,
      },
    ],
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues[0]?.message ?? "invalid ticket",
      ticket: null,
    };
  }
  return { ok: true, ticket: parsed.data };
}
