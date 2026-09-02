import { z } from "zod";
import { stripIdentifiers } from "./prose";
import { confidenceBandSchema, riskClassSchema } from "./investigation";

export const TICKET_ID_RE = /^TCK-\d{4}$/;
export const ENGINEER_ID_RE = /^eng_[a-z_]+$/;

export const SKILL_IDS = [
  "ble-radio",
  "firmware-build",
  "rtos",
  "power-management",
  "adhesive-materials",
  "sensor-hardware",
  "wear-mechanics",
  "regulatory-comms",
  "claims-review",
  "copy-ops",
  "telemetry-pipeline",
  "mobile-app",
  "session-accounting",
  "data-quality",
  "field-ops",
] as const;

export const QUEUE_IDS = [
  "firmware",
  "hardware",
  "product_comms",
  "data_telemetry",
] as const;

/** Mode of skill homes; this order breaks ties. */
export const QUEUE_TIE_BREAK = QUEUE_IDS;

export const ticketQueueSchema = z.enum(QUEUE_IDS);
export const skillIdSchema = z.enum(SKILL_IDS);
export const TICKET_PRIORITIES = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;
export const TICKET_STATUSES = [
  "TRIAGE",
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;
export const WIP_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW"] as const;
export const RAIL_STATUSES = ["TRIAGE", "BACKLOG"] as const;
export const OWNED_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "DONE",
] as const;

export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketActivityKindSchema = z.enum([
  "created",
  "status",
  "reassigned",
  "note",
  "priority",
  "queue",
]);
export const ticketActorSchema = z.union([
  z.literal("routing"),
  z.literal("operator"),
  z.string().regex(ENGINEER_ID_RE),
]);

export const ticketSourceSchema = z.union([
  z.strictObject({
    investigation_id: z.string(),
    action_id: z.string(),
    candidate_id: z.string(),
  }),
  z.literal("manual"),
]);

export const ticketNoteSchema = z.strictObject({
  author: z.string(),
  body: z.string(),
  at: z.string(),
});

export const ticketActivitySchema = z.strictObject({
  kind: ticketActivityKindSchema,
  from: z.string().nullable(),
  to: z.string().nullable(),
  actor: ticketActorSchema,
  at: z.string(),
});

const ticketShapeSchema = z.strictObject({
  ticket_id: z.string().regex(TICKET_ID_RE),
  title: z.string(),
  body: z.string(),
  queue: ticketQueueSchema.nullable(),
  assignee: z.string().regex(ENGINEER_ID_RE).nullable(),
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  source: ticketSourceSchema,
  skills_required: z.array(skillIdSchema),
  routing_rationale: z.string(),
  created_at: z.string(),
  due_at: z.string(),
  updated_at: z.string(),
  notes: z.array(ticketNoteSchema),
  activity: z.array(ticketActivitySchema),
});

/**
 * Ticket identifiers, then the investigation identifier grammar.
 * `{f_n}` is never legal on a ticket field.
 */
export function ticketStripIdentifiers(text: string): string {
  let stripped = stripIdentifiers(text);
  stripped = stripped.replace(/\bTCK-\d+\b/g, " ");
  stripped = stripped.replace(/\beng_[a-z_]+\b/g, " ");
  stripped = stripped.replace(/\bcnd_[a-z0-9_]+\b/g, " ");
  stripped = stripped.replace(/\bact_[a-z0-9_]+\b/g, " ");
  stripped = stripped.replace(/\ba_[0-9]+\b/g, " ");
  return stripped;
}

export function ticketHasBareNumeral(text: string): boolean {
  return /\d/.test(ticketStripIdentifiers(text));
}

export function ticketHasFindingRef(text: string): boolean {
  return /\{f_[1-9]\d*\}/.test(text);
}

function codeComposedErrors(path: string, text: string): string[] {
  const errors: string[] = [];
  if (ticketHasFindingRef(text)) {
    errors.push(`${path}: finding ref is illegal on a ticket`);
  }
  if (ticketHasBareNumeral(text)) {
    const tokens = ticketStripIdentifiers(text).match(/\d+(?:\.\d+)?/g) ?? [];
    for (const token of tokens) {
      errors.push(`${path}: bare numeral ${token}`);
    }
  }
  return errors;
}

function occupancyIssues(ticket: {
  status: z.infer<typeof ticketStatusSchema>;
  queue: z.infer<typeof ticketQueueSchema> | null;
  assignee: string | null;
}): Array<{ message: string; path: (string | number)[] }> {
  const issues: Array<{ message: string; path: (string | number)[] }> = [];
  if (ticket.queue === null && ticket.status !== "TRIAGE") {
    issues.push({
      message: "queue may be null only while status is TRIAGE",
      path: ["queue"],
    });
  }
  if (ticket.status === "TRIAGE") {
    if (ticket.queue !== null) {
      issues.push({ message: "TRIAGE must have a null queue", path: ["queue"] });
    }
    if (ticket.assignee !== null) {
      issues.push({
        message: "TRIAGE cannot have an assignee",
        path: ["assignee"],
      });
    }
  }
  if (ticket.status === "BACKLOG") {
    if (ticket.queue === null) {
      issues.push({ message: "BACKLOG requires a queue", path: ["queue"] });
    }
    if (ticket.assignee !== null) {
      issues.push({
        message: "BACKLOG cannot have an assignee",
        path: ["assignee"],
      });
    }
  }
  if ((OWNED_STATUSES as readonly string[]).includes(ticket.status)) {
    if (ticket.queue === null) {
      issues.push({
        message: `${ticket.status} requires a queue`,
        path: ["queue"],
      });
    }
    if (ticket.assignee === null) {
      issues.push({
        message: `${ticket.status} requires an assignee`,
        path: ["assignee"],
      });
    }
  }
  return issues;
}

export const ticketSchema = ticketShapeSchema.superRefine((ticket, ctx) => {
  for (const issue of occupancyIssues(ticket)) {
    ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }
  for (const [path, text] of [
    ["title", ticket.title],
    ["body", ticket.body],
    ["routing_rationale", ticket.routing_rationale],
  ] as const) {
    for (const error of codeComposedErrors(path, text)) {
      ctx.addIssue({ code: "custom", message: error, path: [path] });
    }
  }
});

export const ticketsArtefactSchema = z.strictObject({
  run_id: z.string(),
  timestamp: z.string(),
  model: z.string(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  tickets: z.array(ticketSchema),
});

export type TicketQueue = z.infer<typeof ticketQueueSchema>;
export type SkillId = z.infer<typeof skillIdSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketSource = z.infer<typeof ticketSourceSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketsArtefact = z.infer<typeof ticketsArtefactSchema>;
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;
export type RiskClass = z.infer<typeof riskClassSchema>;
