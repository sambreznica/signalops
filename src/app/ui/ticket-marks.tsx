import type { TicketPriority, TicketStatus } from "@/lib/schema/ticket";

const R = 5.5;
const C = 2 * Math.PI * R;
export const IN_PROGRESS_GAUGE = 0.4;
export const IN_REVIEW_GAUGE = 0.85;

function Gauge({ fraction, label }: { fraction: number; label: string }) {
  const dash = `${(C * fraction).toFixed(2)} ${(C * (1 - fraction)).toFixed(2)}`;
  return (
    <svg
      className="ticket-status-icon"
      viewBox="0 0 14 14"
      width={14}
      height={14}
      aria-label={label}
      role="img"
    >
      <circle
        cx="7"
        cy="7"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.25"
      />
      <circle
        cx="7"
        cy="7"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray={dash}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

export function StatusIcon({ status }: { status: TicketStatus }) {
  const muted = status === "BLOCKED" || status === "CANCELLED";
  const cls = muted ? "ticket-status-icon is-muted" : "ticket-status-icon";
  if (status === "IN_PROGRESS") {
    return <Gauge fraction={IN_PROGRESS_GAUGE} label="In progress" />;
  }
  if (status === "IN_REVIEW") {
    return <Gauge fraction={IN_REVIEW_GAUGE} label="In review" />;
  }
  if (status === "TRIAGE") {
    return (
      <svg className={cls} viewBox="0 0 14 14" width={14} height={14} aria-label="Triage" role="img">
        <circle cx="7" cy="7" r="5.5" fill="currentColor" />
        <circle cx="7" cy="7" r="1.6" fill="var(--bg-card)" />
      </svg>
    );
  }
  if (status === "BACKLOG") {
    return (
      <svg className={cls} viewBox="0 0 14 14" width={14} height={14} aria-label="Backlog" role="img">
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="2.2 1.8"
        />
      </svg>
    );
  }
  if (status === "TODO") {
    return (
      <svg className={cls} viewBox="0 0 14 14" width={14} height={14} aria-label="Todo" role="img">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    );
  }
  if (status === "BLOCKED") {
    return (
      <svg className={cls} viewBox="0 0 14 14" width={14} height={14} aria-label="Blocked" role="img">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <rect x="5" y="4.5" width="1.4" height="5" rx="0.4" fill="currentColor" />
        <rect x="7.6" y="4.5" width="1.4" height="5" rx="0.4" fill="currentColor" />
      </svg>
    );
  }
  if (status === "DONE") {
    return (
      <svg className={cls} viewBox="0 0 14 14" width={14} height={14} aria-label="Done" role="img">
        <circle cx="7" cy="7" r="5.5" fill="currentColor" />
        <path
          d="M4.6 7.1 L6.3 8.8 L9.5 5.2"
          fill="none"
          stroke="var(--bg-card)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "CANCELLED") {
    return (
      <svg className={cls} viewBox="0 0 14 14" width={14} height={14} aria-label="Cancelled" role="img">
        <circle cx="7" cy="7" r="5.5" fill="currentColor" />
        <path
          d="M5 5 L9 9 M9 5 L5 9"
          fill="none"
          stroke="var(--bg-card)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return null;
}

function Bars({ filled, label }: { filled: 1 | 2 | 3; label: string }) {
  return (
    <svg
      className="ticket-priority-glyph"
      viewBox="0 0 14 14"
      width={14}
      height={14}
      aria-label={label}
      role="img"
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2 + i * 3.5}
          y={10 - (i + 1) * 2.4}
          width="2.6"
          height={(i + 1) * 2.4}
          rx="0.4"
          fill="currentColor"
          opacity={i < filled ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

export function PriorityGlyph({ priority }: { priority: TicketPriority }) {
  if (priority === "URGENT") {
    return (
      <svg
        className="ticket-priority-glyph is-urgent"
        viewBox="0 0 14 14"
        width={14}
        height={14}
        aria-label="Urgent"
        role="img"
      >
        <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
        <path
          d="M7 4.2 V8.1 M7 9.4 V10.2"
          stroke="var(--bg-card)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (priority === "HIGH") return <Bars filled={3} label="High" />;
  if (priority === "MEDIUM") return <Bars filled={2} label="Medium" />;
  return <Bars filled={1} label="Low" />;
}

export function assigneeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
