import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANDIDATE_ID,
  DEFAULT_RUN_ID,
  loadAgentRuns,
  loadKnowledgeDocs,
  loadReplayRun,
  loadTicketsArtefact,
  loadTriageCandidates,
  recordForCandidate,
  scoreAgentRuns,
} from "./load";

describe("replay loaders", () => {
  it("loads the default ceiling artefact with four investigations", () => {
    const run = loadReplayRun(DEFAULT_RUN_ID);
    expect(run.run_id).toBe("run-ceiling-3");
    expect(run.kind).toBe("agent");
    expect(run.investigations.map((row) => row.candidate_id)).toEqual([
      "cnd_fw_1_4_2",
      "cnd_tag_skin_irritation",
      "cnd_tag_claims_interpretation",
      "cnd_tag_overheating",
    ]);
    expect(DEFAULT_CANDIDATE_ID).toBe("cnd_fw_1_4_2");
  });

  it("emits thirteen ranked triage candidates", () => {
    const candidates = loadTriageCandidates();
    expect(candidates).toHaveLength(13);
    const ids = candidates.map((c) => c.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids[0]).toBeDefined();
  });

  it("lists six knowledge documents with chunk text and no vectors", () => {
    const docs = loadKnowledgeDocs();
    expect(docs.map((d) => d.doc_id)).toEqual([
      "KD-01",
      "KD-02",
      "KD-03",
      "KD-04",
      "KD-05",
      "KD-06",
    ]);
    expect(docs.every((d) => d.chunk_count === d.chunks.length)).toBe(true);
    expect(docs.some((d) => d.chunks.some((c) => c.text.length > 0))).toBe(true);
    expect(docs.every((d) => d.chunks.every((c) => !("embedding" in c)))).toBe(
      true,
    );
  });

  it("does not treat a sibling tickets artefact as an agent run", () => {
    const runs = loadAgentRuns();
    expect(runs.every((r) => r.kind === "agent")).toBe(true);
    const artefact = loadTicketsArtefact(DEFAULT_RUN_ID);
    expect(artefact).not.toBeNull();
    expect(artefact!.tickets.length).toBeGreaterThanOrEqual(3);
    const candidates = new Set(
      artefact!.tickets.flatMap((t) =>
        t.source === "manual" ? [] : [t.source.candidate_id],
      ),
    );
    expect(candidates.size).toBeGreaterThanOrEqual(2);
  });

  it("scores agent runs without a suite headline helper", () => {
    const scored = scoreAgentRuns(loadAgentRuns());
    expect(scored.length).toBeGreaterThan(0);
    const ceiling = scored.find((s) => s.run.run_id === DEFAULT_RUN_ID);
    expect(ceiling).toBeDefined();
    expect(ceiling!.results).toHaveLength(10);
    const eval08 = ceiling!.results.find((r) => r.id === "EVAL-08");
    expect(eval08?.pass).toBe(true);
    expect(eval08?.reason).toMatch(/boundary held/);
    const overheating = recordForCandidate(ceiling!.run, "cnd_tag_overheating");
    expect(overheating?.output.status).toBe("NOT_AN_INCIDENT");
    expect(overheating?.output.confidence.model_requested).toBe("HIGH");
    expect(overheating?.output.confidence.granted).toBe("MEDIUM");
    expect(overheating?.output.confidence.ceiling_rule_applied).toBe(
      "unrebutted_counter_evidence",
    );
  });
});
