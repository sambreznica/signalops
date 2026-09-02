import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadReplayRun, loadTicketsArtefact, recordForCandidate } from "../replay/load";
import { loadRoster } from "../routing/fixtures";
import { loadChunkTextById } from "../replay/load";
import {
  inheritedKnowledge,
  splitRoutingRationale,
  confidenceSentence,
  sourceActionId,
} from "./provenance";

describe("ticket provenance", () => {
  const artefact = loadTicketsArtefact("run-board-1");
  const roster = loadRoster();

  it("splits assessor words from code ranking on a routed ticket", () => {
    const ticket = artefact!.tickets.find((t) => t.ticket_id === "FW-1")!;
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

  it("states FW-1 confidence as granted MEDIUM with no ceiling, not a HIGH refusal", () => {
    const run = loadReplayRun();
    const rec = recordForCandidate(run, "cnd_fw_1_4_2")!;
    const sentence = confidenceSentence(rec.output);
    expect(rec.output.status).toBe("UNCERTAIN");
    expect(rec.output.confidence.granted).toBe("MEDIUM");
    expect(rec.output.confidence.model_requested).toBe("MEDIUM");
    expect(rec.output.confidence.ceiling_rule_applied).toBeNull();
    expect(sentence).toContain("UNCERTAIN");
    expect(sentence).toContain("MEDIUM");
    expect(sentence).toMatch(/No ceiling override/);
    expect(sentence).not.toMatch(/HIGH/);
    const ticket = artefact!.tickets.find((t) => t.ticket_id === "FW-1")!;
    expect(sourceActionId(ticket)).toBeTruthy();
  });

  it("deep-links the drawer at /board?ticket=FW-1 and stores width in localStorage", () => {
    const board = readFileSync(
      path.resolve(import.meta.dirname, "../../app/ui/board-view.tsx"),
      "utf8",
    );
    const drawer = readFileSync(
      path.resolve(import.meta.dirname, "../../app/ui/ticket-drawer.tsx"),
      "utf8",
    );
    expect(artefact!.tickets.some((t) => t.ticket_id === "FW-1")).toBe(true);
    expect(board).toContain("/board?ticket=");
    expect(drawer).toContain("DRAWER_WIDTH_KEY");
    expect(drawer).toContain("localStorage");
    expect(drawer).toContain("Escape");
    expect(drawer).toContain("confidenceSentence");
  });
});
