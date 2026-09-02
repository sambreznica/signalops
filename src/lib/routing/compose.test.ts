import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { InvestigationOutput } from "../schema/investigation";
import { ticketHasBareNumeral, ticketHasFindingRef } from "../schema/ticket";
import { composeBody, composeTitle, titleForbiddenHits } from "./compose";

type RunFile = {
  investigations: Array<{ output: InvestigationOutput }>;
};

const ROOT = path.resolve(import.meta.dirname, "../../..");

function loadActions(runId: string) {
  const tickets = JSON.parse(
    readFileSync(path.join(ROOT, "runs", `${runId}.tickets.json`), "utf8"),
  ) as {
    tickets: Array<{
      ticket_id: string;
      source:
        | { investigation_id: string; action_id: string; candidate_id: string }
        | "manual";
    }>;
  };
  const run = JSON.parse(
    readFileSync(path.join(ROOT, "runs", `${runId}.json`), "utf8"),
  ) as RunFile;
  const byInv = new Map(
    run.investigations.map((row) => [row.output.investigation_id, row.output]),
  );
  return tickets.tickets.flatMap((ticket) => {
    if (ticket.source === "manual") return [];
    const output = byInv.get(ticket.source.investigation_id);
    const action = output?.recommended_actions.find(
      (a) => a.action_id === ticket.source.action_id,
    );
    if (!action) return [];
    return [
      {
        ticket_id: ticket.ticket_id,
        candidateId: ticket.source.candidate_id,
        action,
      },
    ];
  });
}

describe("ticket title generator", () => {
  it("emits the eleven committed titles with no enum or schema-field words", () => {
    const rows = loadActions("run-board-1");
    expect(rows).toHaveLength(11);
    const titles = rows.map((row) => ({
      id: row.ticket_id,
      title: composeTitle({
        candidateId: row.candidateId,
        action: row.action,
      }),
    }));
    for (const row of titles) {
      expect(titleForbiddenHits(row.title), row.title).toEqual([]);
      expect(ticketHasFindingRef(row.title), row.title).toBe(false);
      expect(ticketHasBareNumeral(row.title), row.title).toBe(false);
      expect(row.title.endsWith(".")).toBe(false);
      expect(row.title.length).toBeLessThanOrEqual(70);
    }
    expect(Object.fromEntries(titles.map((t) => [t.id, t.title]))).toEqual({
      "FW-1": "RF characterisation for the 1.4.2 supervisor-timing change",
      "FW-2": "Phone confound check on 1.4.2 disconnects",
      "FW-3": "Counted-events vs connected-time diagnostic",
      "HW-1": "Continue monitoring skin-irritation volume",
      "HW-2": "Lot split for skin-irritation tickets",
      "HW-3": "Do not close skin-irritation as expected",
      "PC-1": "Copy review of on-screen readiness",
      "PC-2": "Claims tickets by firmware and app version",
      "PC-3": "Wellness-score clarification copy",
      "DT-1": "Confirm overheating tag is a known cosmetic UI issue",
      "DT-2": "Watch overheating tags for a step change",
    });
  });

  it("accepts action descriptions as bodies when they pass the identifier grammar", () => {
    for (const row of loadActions("run-board-1")) {
      const body = composeBody(row.action);
      expect(ticketHasFindingRef(body)).toBe(false);
      expect(ticketHasBareNumeral(body)).toBe(false);
    }
  });
});
