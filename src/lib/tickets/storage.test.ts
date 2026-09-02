import { describe, expect, it } from "vitest";
import { ticketSchema, type Ticket } from "../schema/ticket";
import { loadTickets, saveTickets, upsertTicket } from "./storage";

function ticket(id: string): Ticket {
  return ticketSchema.parse({
    ticket_id: id,
    title: "Approved action act_1",
    body: "Work from this investigation. Figures stay on the investigation record.",
    queue: "firmware",
    assignee: "eng_priya_nair",
    priority: "MEDIUM",
    status: "TODO",
    source: {
      investigation_id: "inv_a",
      action_id: "act_1",
      candidate_id: "cnd_a",
    },
    skills_required: ["ble-radio"],
    routing_rationale: "Radio work. Priya Nair selected: overlap ble-radio; under capacity; roster order as remaining tie.",
    created_at: "2026-08-26T10:13:39.028Z",
    due_at: "2026-08-29T10:13:39.028Z",
    updated_at: "2026-08-26T10:13:39.028Z",
    notes: [],
    activity: [
      {
        kind: "created",
        from: null,
        to: "TODO",
        actor: "routing",
        at: "2026-08-26T10:13:39.028Z",
      },
    ],
  });
}

describe("ticket storage", () => {
  it("round-trips through an in-memory store keyed by run id", () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    saveTickets("run-ceiling-3", [ticket("TCK-0001")], store);
    expect(loadTickets("run-ceiling-3", store)[0]?.ticket_id).toBe("TCK-0001");
    expect(loadTickets("other", store)).toEqual([]);
    upsertTicket("run-ceiling-3", ticket("TCK-0002"), store);
    expect(loadTickets("run-ceiling-3", store).map((t) => t.ticket_id)).toEqual([
      "TCK-0001",
      "TCK-0002",
    ]);
  });

  it("migrates a stale ASSIGNED/P3 blob on read without adding activity", () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    const stale = ticket("TCK-0001") as unknown as Record<string, unknown>;
    store.setItem(
      "signalops.tickets.run-x",
      JSON.stringify({
        tickets: [
          {
            ...stale,
            status: "ASSIGNED",
            priority: "P3",
            activity: [
              {
                kind: "created",
                from: null,
                to: "ASSIGNED",
                actor: "routing",
                at: stale.created_at,
              },
            ],
          },
        ],
      }),
    );
    const loaded = loadTickets("run-x", store);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.status).toBe("TODO");
    expect(loaded[0]!.priority).toBe("MEDIUM");
    expect(loaded[0]!.activity).toHaveLength(1);
    expect(loaded[0]!.activity[0]!.to).toBe("TODO");
  });
});
