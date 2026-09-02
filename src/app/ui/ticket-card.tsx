"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Ticket } from "@/lib/schema/ticket";
import { engineerById } from "@/lib/routing/fixtures";
import { ageLabel, isOverdue } from "@/lib/tickets/overdue";
import { sourceCandidateId } from "@/lib/tickets/provenance";

function priorityChip(priority: Ticket["priority"]): string {
  if (priority === "P1") return "chip chip-critical";
  if (priority === "P2") return "chip chip-elevated";
  return "chip chip-inert";
}

export function TicketCardFace({
  ticket,
  now,
  selected,
  onToggleSelect,
  onOpen,
}: {
  ticket: Ticket;
  now: Date;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
}) {
  const engineer = ticket.assignee ? engineerById(ticket.assignee) : null;
  const overdue = isOverdue(ticket, now);
  const sourceId = sourceCandidateId(ticket);
  return (
    <article
      className={`ticket-card ${overdue ? "is-overdue" : ""}`}
      aria-labelledby={`${ticket.ticket_id}-title`}
    >
      <div className="flex items-start gap-2">
        {onToggleSelect ? (
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(selected)}
            onChange={onToggleSelect}
            aria-label={`Select ${ticket.ticket_id}`}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="mono text-mute">
            {ticket.ticket_id}
            <span className={`ml-2 ${priorityChip(ticket.priority)}`}>
              {ticket.priority}
            </span>
          </p>
          <button
            type="button"
            id={`${ticket.ticket_id}-title`}
            className="dense mt-1 text-left"
            onClick={onOpen}
          >
            {ticket.title}
          </button>
          <p className="dense text-graphite mt-1">
            {engineer ? engineer.name : "unassigned"}
          </p>
          {ticket.skills_required.length > 0 ? (
            <p className="mt-1 flex flex-wrap gap-1">
              {ticket.skills_required.map((s) => (
                <span key={s} className="chip chip-inert">
                  {s}
                </span>
              ))}
            </p>
          ) : null}
          <p className={`dense mt-1 ticket-age ${overdue ? "text-critical" : "text-mute"}`}>
            {ageLabel(ticket, now)}
            {overdue ? " · past due" : ""}
          </p>
          {sourceId ? (
            <span className="chip chip-inert mt-1">{sourceId}</span>
          ) : (
            <span className="chip chip-inert mt-1">manual</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function TicketCard({
  ticket,
  now,
  selected,
  onToggleSelect,
  onOpen,
}: {
  ticket: Ticket;
  now: Date;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: ticket.ticket_id,
      data: { ticketId: ticket.ticket_id },
    });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-60" : undefined}
      {...listeners}
      {...attributes}
    >
      <TicketCardFace
        ticket={ticket}
        now={now}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onOpen={onOpen}
      />
    </div>
  );
}
