import { describe, expect, it } from "vitest";
import { loadReplayRun, loadTicketsArtefact, recordForCandidate } from "../replay/load";
import { loadRoster } from "../routing/fixtures";
import { loadChunkTextById } from "../replay/load";
import { inheritedKnowledge, splitRoutingRationale } from "./provenance";

describe("ticket provenance", () => {
  const artefact = loadTicketsArtefact("run-board-1");
  const roster = loadRoster();

  it("splits assessor words from code ranking on a routed ticket", () => {
    const ticket = artefact!.tickets.find((t) => t.ticket_id === "TCK-0001")!;
    const split = splitRoutingRationale(ticket, roster);
    expect(split.assessor.skills).toContain("ble-radio");
    expect(split.assessor.words.length).toBeGreaterThan(20);
    expect(split.assessor.words).not.toMatch(/selected:/);
    expect(split.code.overlapCount).toBeGreaterThan(0);
    expect(split.code.wipCheck).toBe("under capacity");
    expect(split.code.tieBreak).toMatch(/roster order/);
    expect(split.code.words).toMatch(/Priya Nair selected:/);
  });

  it("inherits knowledge chunks from supporting evidence, and synthesises none for a manual ticket", () => {
    const run = loadReplayRun();
    const rec = recordForCandidate(run, "cnd_tag_claims_interpretation")!;
    const ticket = artefact!.tickets.find(
      (t) => t.source !== "manual" && t.source.candidate_id === "cnd_tag_claims_interpretation",
    )!;
    const chunks = loadChunkTextById();
    const inherited = inheritedKnowledge(ticket, rec.output, chunks);
    expect(inherited.length).toBeGreaterThan(0);
    expect(inherited.every((k) => k.doc_id.length > 0)).toBe(true);
    const manual = {
      ...ticket,
      source: "manual" as const,
      routing_rationale: "Operator created this ticket. No skills assessor ran.",
    };
    expect(inheritedKnowledge(manual, rec.output, chunks)).toEqual([]);
  });
});
