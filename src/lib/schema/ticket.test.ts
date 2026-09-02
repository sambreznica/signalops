import { describe, expect, it } from "vitest";
import {
  ticketHasBareNumeral,
  ticketSchema,
  type Ticket,
} from "./ticket";

function validTicket(overrides: Partial<Ticket> = {}): Ticket {
  const base = {
    ticket_id: "TCK-0001",
    title: "Approved action act_1",
    body: "Work from this investigation. Figures stay on the investigation record.",
    queue: "firmware" as const,
    assignee: "eng_priya_nair",
    priority: "MEDIUM" as const,
    status: "TODO" as const,
    source: {
      investigation_id: "inv_cnd_fw_1_4_2",
      action_id: "act_1",
      candidate_id: "cnd_fw_1_4_2",
    },
    skills_required: ["ble-radio", "firmware-build"] as Ticket["skills_required"],
    routing_rationale:
      "Radio characterisation work. Priya Nair selected: overlap ble-radio, firmware-build; under capacity; roster order as remaining tie.",
    created_at: "2026-08-26T10:13:39.028Z",
    due_at: "2026-08-29T10:13:39.028Z",
    updated_at: "2026-08-26T10:13:39.028Z",
    notes: [],
    activity: [
      {
        kind: "created" as const,
        from: null,
        to: "TODO",
        actor: "routing" as const,
        at: "2026-08-26T10:13:39.028Z",
      },
    ],
  };
  return ticketSchema.parse({ ...base, ...overrides });
}

describe("ticket schema freeze", () => {
  it("parses a routed TODO ticket", () => {
    const parsed = validTicket();
    expect(parsed.status).toBe("TODO");
    expect(parsed.queue).toBe("firmware");
    expect(parsed.priority).toBe("MEDIUM");
  });

  it("allows null queue only on TRIAGE", () => {
    const deck = validTicket({
      queue: null,
      assignee: null,
      status: "TRIAGE",
      skills_required: [],
      routing_rationale: "Assessor produced no usable skill.",
      activity: [
        {
          kind: "created",
          from: null,
          to: "TRIAGE",
          actor: "routing",
          at: "2026-08-26T10:13:39.028Z",
        },
      ],
    });
    expect(deck.queue).toBeNull();
    expect(() =>
      ticketSchema.parse({
        ...deck,
        status: "TODO",
        assignee: "eng_priya_nair",
      }),
    ).toThrow();
  });

  it("rejects NONE as a priority", () => {
    expect(() =>
      ticketSchema.parse({ ...validTicket(), priority: "NONE" }),
    ).toThrow();
  });

  it("rejects a finding ref on routing_rationale", () => {
    expect(() =>
      validTicket({ routing_rationale: "See {f_1} for the rate." }),
    ).toThrow();
  });

  it("rejects a bare numeral on title", () => {
    expect(() => validTicket({ title: "Rollback 14 devices" })).toThrow();
  });

  it("treats TCK ids and action ids as names", () => {
    expect(ticketHasBareNumeral("Approved action act_1")).toBe(false);
    expect(ticketHasBareNumeral("Approved action a_1")).toBe(false);
    expect(ticketHasBareNumeral("TCK-0003 is late")).toBe(false);
    expect(ticketHasBareNumeral("fourteen devices")).toBe(false);
    expect(ticketHasBareNumeral("rate rose 12")).toBe(true);
  });
});
