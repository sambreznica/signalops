import { describe, expect, it } from "vitest";
import type { RecommendedAction } from "../schema/investigation";
import type { Ticket } from "../schema/ticket";
import { loadRoster, loadSkillsTaxonomy } from "./fixtures";
import { derivePriority } from "./priority";
import { dueAt } from "./sla";
import { existingForAction, mergeTickets, nextTicketId, route } from "./route";
import { boardNow } from "./clock";

const now = new Date("2026-08-26T10:13:39.028Z");

function action(
  action_id: string,
  risk_class: RecommendedAction["risk_class"],
): RecommendedAction {
  return {
    action_id,
    description: "placeholder",
    risk_class,
  };
}

describe("priority table", () => {
  it("INTERNAL x MEDIUM is MEDIUM", () => {
    expect(derivePriority("INTERNAL", "MEDIUM")).toEqual({
      priority: "MEDIUM",
      granted_missing: false,
    });
  });

  it("PRODUCTION x MEDIUM is HIGH (risk-class floor)", () => {
    expect(derivePriority("PRODUCTION", "MEDIUM")).toEqual({
      priority: "HIGH",
      granted_missing: false,
    });
    expect(derivePriority("PRODUCTION", "LOW")).toEqual({
      priority: "HIGH",
      granted_missing: false,
    });
  });
});

describe("route", () => {
  const roster = loadRoster();
  const taxonomy = loadSkillsTaxonomy();

  it("assigns firmware skills to the Firmware queue under capacity", () => {
    const ticket = route({
      action: action("act_1", "INTERNAL"),
      investigation_id: "inv_cnd_fw_1_4_2",
      candidate_id: "cnd_fw_1_4_2",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["ble-radio", "firmware-build"],
        expertise_rationale: "Radio characterisation of a firmware train.",
        fallback: "none",
      },
    });
    expect(ticket.ticket_id).toBe("TCK-0001");
    expect(ticket.queue).toBe("firmware");
    expect(ticket.status).toBe("TODO");
    expect(ticket.assignee).toBe("eng_priya_nair");
    expect(ticket.priority).toBe("MEDIUM");
    expect(ticket.due_at).toBe(dueAt(now, "MEDIUM").toISOString());
    expect(ticket.routing_rationale).toContain("Priya Nair");
  });

  it("PRODUCTION x MEDIUM is HIGH on a routed ticket", () => {
    const ticket = route({
      action: action("act_3", "PRODUCTION"),
      investigation_id: "inv_cnd_fw_1_4_2",
      candidate_id: "cnd_fw_1_4_2",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["firmware-build"],
        expertise_rationale: "A production firmware change.",
        fallback: "none",
      },
    });
    expect(ticket.priority).toBe("HIGH");
    expect(ticket.due_at).toBe(dueAt(now, "HIGH").toISOString());
  });

  it("empty skills land TRIAGE with null queue", () => {
    const ticket = route({
      action: action("a_1", "INTERNAL"),
      investigation_id: "inv_cnd_tag_overheating",
      candidate_id: "cnd_tag_overheating",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: [],
        expertise_rationale: "",
        fallback: "empty",
      },
    });
    expect(ticket.status).toBe("TRIAGE");
    expect(ticket.queue).toBeNull();
    expect(ticket.assignee).toBeNull();
    expect(ticket.routing_rationale).toContain("no usable skill");
  });

  it("a numeral in the assessor rationale uses the no-usable-skill path", () => {
    const ticket = route({
      action: action("act_1", "INTERNAL"),
      investigation_id: "inv_x",
      candidate_id: "cnd_x",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["ble-radio"],
        expertise_rationale: "",
        fallback: "bare_numeral",
      },
    });
    expect(ticket.skills_required).toEqual([]);
    expect(ticket.status).toBe("TRIAGE");
    expect(ticket.routing_rationale).toContain("contained a figure");
  });

  it("does not overflow WIP", () => {
    const first = route({
      action: action("act_1", "INTERNAL"),
      investigation_id: "inv_a",
      candidate_id: "cnd_a",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["rtos", "power-management"],
        expertise_rationale: "On-device scheduler and power work.",
        fallback: "none",
      },
    });
    expect(first.assignee).toBe("eng_elena_varga");
    const second = route({
      action: action("act_2", "INTERNAL"),
      investigation_id: "inv_a",
      candidate_id: "cnd_a",
      granted: "MEDIUM",
      existing: [first],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["rtos", "power-management"],
        expertise_rationale: "On-device scheduler and power work.",
        fallback: "none",
      },
    });
    expect(second.assignee).not.toBe("eng_elena_varga");
  });

  it("nextTicketId increments and existingForAction is the idempotence key", () => {
    const first = route({
      action: action("act_1", "INTERNAL"),
      investigation_id: "inv_a",
      candidate_id: "cnd_a",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["copy-ops"],
        expertise_rationale: "In-product copy change.",
        fallback: "none",
      },
    });
    expect(nextTicketId([first])).toBe("TCK-0002");
    expect(existingForAction([first], "inv_a", "act_1")?.ticket_id).toBe(
      "TCK-0001",
    );
  });

  it("mergeTickets lets the committed artefact fill gaps without duplicating an action", () => {
    const first = route({
      action: action("act_1", "INTERNAL"),
      investigation_id: "inv_a",
      candidate_id: "cnd_a",
      granted: "MEDIUM",
      existing: [],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["copy-ops"],
        expertise_rationale: "In-product copy change.",
        fallback: "none",
      },
    });
    const second = route({
      action: action("act_3", "PRODUCTION"),
      investigation_id: "inv_a",
      candidate_id: "cnd_a",
      granted: "MEDIUM",
      existing: [first],
      now,
      roster,
      taxonomy,
      assessor: {
        skills_required: ["firmware-build"],
        expertise_rationale: "A production firmware change.",
        fallback: "none",
      },
    });
    expect(mergeTickets([first], [first, second]).map((t) => t.ticket_id)).toEqual(
      ["TCK-0001", "TCK-0002"],
    );
  });
});

describe("boardNow", () => {
  it("uses the artefact timestamp in replay", () => {
    const frozen = boardNow({
      mode: "replay",
      runTimestamp: "2026-08-26T10:13:39.028Z",
      wall: new Date("2026-08-27T12:00:00.000Z"),
    });
    expect(frozen.toISOString()).toBe("2026-08-26T10:13:39.028Z");
  });
});

export type _Ticket = Ticket;
