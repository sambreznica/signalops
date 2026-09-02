"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Ticket } from "@/lib/schema/ticket";
import { engineerById } from "@/lib/routing/fixtures";
import { ageLabel, isOverdue } from "@/lib/tickets/overdue";
import { sourceCandidateId } from "@/lib/tickets/provenance";
import {
  PriorityGlyph,
  StatusIcon,
  assigneeInitials,
} from "./ticket-marks";

export function TicketCardFace({
  ticket,
  now,
  selected,
  onToggleSelect,
  onOpen,
  showStatusIcon,
}: {
  ticket: Ticket;
  now: Date;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  showStatusIcon?: boolean;
}) {
  const engineer = ticket.assignee ? engineerById(ticket.assignee) : null;
  const overdue = isOverdue(ticket, now);
  const sourceId = sourceCandidateId(ticket);
  const skills = ticket.skills_required;
  const shownSkills = skills.slice(0, 2);
  const extraSkills = skills.length - shownSkills.length;
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
          <div className="flex items-center justify-between gap-2">
            <p className="mono text-tertiary flex items-center gap-1">
              {showStatusIcon ? <StatusIcon status={ticket.status} /> : null}
              {ticket.ticket_id}
            </p>
            <PriorityGlyph priority={ticket.priority} />
          </div>
          <button
            type="button"
            id={`${ticket.ticket_id}-title`}
            className="body font-ui mt-1 text-left text-primary"
            onClick={onOpen}
          >
            {ticket.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {shownSkills.map((s) => (
              <span key={s} className="chip chip-inert">
                {s}
              </span>
            ))}
            {extraSkills > 0 ? (
              <span className="chip chip-inert">+{extraSkills}</span>
            ) : null}
            {sourceId ? (
              <span className="chip chip-inert">{sourceId}</span>
            ) : (
              <span className="chip chip-inert">manual</span>
            )}
            <span className="ml-auto flex items-center gap-1">
              {engineer ? (
                <span
                  className="assignee-initials"
                  title={engineer.name}
                  aria-label={engineer.name}
                >
                  {assigneeInitials(engineer.name)}
                </span>
              ) : null}
              <span
                className={`caption ${overdue ? "text-danger" : "text-muted"}`}
              >
                {ageLabel(ticket, now)}
              </span>
            </span>
          </div>
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
  showStatusIcon,
}: {
  ticket: Ticket;
  now: Date;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  showStatusIcon?: boolean;
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
        showStatusIcon={showStatusIcon}
      />
    </div>
  );
}
