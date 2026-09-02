import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../evals/paths";
import { loadChunkTextById, loadReplayRun, recordForCandidate } from "../replay/load";
import { firstLine } from "../replay/copy";

describe("Knowledge is not a route", () => {
  it("has no /knowledge page and the nav points at the Board", () => {
    expect(existsSync(path.join(ROOT, "src/app/knowledge/page.tsx"))).toBe(
      false,
    );
    expect(existsSync(path.join(ROOT, "src/app/ui/knowledge-view.tsx"))).toBe(
      false,
    );
    const nav = readFileSync(path.join(ROOT, "src/app/ui/nav.tsx"), "utf8");
    expect(nav).toContain('href: "/board"');
    expect(nav).not.toContain("/knowledge");
  });

  it("keeps chunk expansion on the Investigation Full Record, in-page", () => {
    const src = readFileSync(
      path.join(ROOT, "src/app/ui/investigation-view.tsx"),
      "utf8",
    );
    expect(src).not.toContain("/knowledge");
    expect(src).toContain("id={slugId(k.chunk_id)}");
    expect(src).toContain("<details");
    const run = loadReplayRun();
    const rec = recordForCandidate(run, "cnd_fw_1_4_2");
    const chunks = loadChunkTextById();
    expect(rec!.output.knowledge_sources.length).toBeGreaterThan(0);
    for (const k of rec!.output.knowledge_sources) {
      const chunk = chunks.get(k.chunk_id);
      expect(chunk).toBeDefined();
      expect(firstLine(chunk!.text).lead.length).toBeGreaterThan(0);
    }
  });
});
