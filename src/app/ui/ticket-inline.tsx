import type { Ticket } from "@/lib/schema/ticket";
import { engineerById } from "@/lib/routing/fixtures";

const QUEUE_LABEL: Record<string, string> = {
  firmware: "Firmware",
  hardware: "Hardware",
  product_comms: "Product Comms",
  data_telemetry: "Data & Telemetry",
};

export function TicketInline({ ticket }: { ticket: Ticket }) {
  const engineer = ticket.assignee ? engineerById(ticket.assignee) : null;
  const queue =
    ticket.queue === null
      ? "unset (on deck)"
      : (QUEUE_LABEL[ticket.queue] ?? ticket.queue);
  const who = engineer ? engineer.name : "unassigned";
  return (
    <div className="ticket-inline mt-2">
      <p className="label mb-1">Ticket</p>
      <p className="mono">
        {ticket.ticket_id}
        <span className="chip chip-inert ml-2">{ticket.priority}</span>
        <span className="chip chip-inert ml-1">{ticket.status.replaceAll("_", " ")}</span>
      </p>
      <p className="dense mt-1">
        {queue} · {who}
      </p>
      <p className="dense mt-1">
        <a href={`/board?ticket=${ticket.ticket_id}`}>Board</a>
      </p>
      <p className="dense text-mute mt-1 prose-measure">{ticket.routing_rationale}</p>
    </div>
  );
}
