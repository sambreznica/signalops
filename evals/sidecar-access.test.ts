import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./paths";

function walkTs(dir: string, skipTests: boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full, skipTests));
    else if (!entry.name.endsWith(".ts")) continue;
    else if (skipTests && entry.name.endsWith(".test.ts")) continue;
    else out.push(full);
  }
  return out;
}

const BANNED = ["signals.json", "SIG-00", "CLUSTER_TAGS"];

describe("sidecar access", () => {
  it("evals production code reads synthetic-data/signals.json", () => {
    const files = walkTs(path.join(ROOT, "evals"), true);
    expect(files.length).toBeGreaterThan(0);
    const combined = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(combined).toContain("signals.json");
  });

  it("analytics and triage production code still do not", () => {
    for (const rel of ["src/lib/analytics", "src/lib/triage"]) {
      const files = walkTs(path.join(ROOT, rel), true);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const token of BANNED) {
          expect(source, `${path.basename(file)} contains ${token}`).not.toContain(
            token,
          );
        }
      }
    }
  });
});
