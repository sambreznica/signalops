import { describe, expect, it } from "vitest";
import { loadTicketsArtefact } from "../replay/load";
import { isOverdue, ageMs } from "./overdue";

describe("SLA clock", () => {
  const artefact = loadTicketsArtefact("run-board-1");
  if (!artefact) throw new Error("run-board-1 tickets missing");
  const ticket = artefact.tickets[0]!;
  const replayNow = new Date(artefact.timestamp);

  it("is not overdue at the run timestamp — create and now share the frozen stamp", () => {
    expect(ticket.created_at).toBe(artefact.timestamp);
    expect(isOverdue(ticket, replayNow)).toBe(false);
    expect(ageMs(ticket, replayNow)).toBe(0);
    expect(artefact.tickets.every((t) => !isOverdue(t, replayNow))).toBe(true);
  });

  it("is overdue in live mode when wall-clock is past due_at", () => {
    const liveNow = new Date("2026-09-02T20:00:00.000Z");
    expect(liveNow.getTime()).toBeGreaterThan(new Date(ticket.due_at).getTime());
    expect(isOverdue(ticket, liveNow)).toBe(true);
    const done = { ...ticket, status: "DONE" as const };
    expect(isOverdue(done, liveNow)).toBe(false);
    const cancelled = { ...ticket, status: "CANCELLED" as const };
    expect(isOverdue(cancelled, liveNow)).toBe(false);
  });
});
