import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname);

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const BANNED = [
  "signals.json",
  "SIG-00",
  "CLUSTER_TAGS",
  "authorial_severity",
  "lib/schema",
];

describe("analytics boundary", () => {
  it("does not import the sidecar, signal ids, or the investigation schema", () => {
    const files = walk(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of BANNED) {
        expect(source, `${path.basename(file)} contains ${token}`).not.toContain(
          token,
        );
      }
    }
  });
});
