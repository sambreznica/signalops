import { describe, expect, it } from "vitest";
import { BODY_SPLIT_CHARS, chunkMarkdown, docIdFromFilename, splitBody } from "./chunk";

describe("docIdFromFilename", () => {
  it("takes the KD-nn prefix", () => {
    expect(docIdFromFilename("KD-02-firmware-release-notes.md")).toBe("KD-02");
    expect(docIdFromFilename("knowledge/KD-04-known-issues-register.md")).toBe(
      "KD-04",
    );
  });

  it("rejects a file without a KD prefix", () => {
    expect(() => docIdFromFilename("readme.md")).toThrow(/doc_id/);
  });
});

describe("splitBody", () => {
  it("leaves short bodies intact", () => {
    expect(splitBody("hello")).toEqual(["hello"]);
  });

  it("splits on blank lines once over the character budget", () => {
    const a = "a".repeat(500);
    const b = "b".repeat(500);
    const parts = splitBody(`${a}\n\n${b}`, 800);
    expect(parts).toEqual([a, b]);
  });

  it("splits on words when a single paragraph exceeds the budget", () => {
    const words = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
    const parts = splitBody(words, 40);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 40)).toBe(true);
    expect(parts.join(" ")).toBe(words);
  });
});

describe("chunkMarkdown", () => {
  const md = `# Product Spec

Preamble about the Loop.

## Radio

BLE 5.2 peripheral.

### Supervisor

Timeout is four seconds.

## Battery

Drain is a percent of the pouch per device-day.
`;

  it("sets title from H1 and sections from ## / ###", () => {
    const chunks = chunkMarkdown("KD-01-product-specification.md", md);
    expect(chunks[0]?.title).toBe("Product Spec");
    expect(chunks.map((c) => c.section)).toEqual([
      "Product Spec",
      "Radio",
      "Supervisor",
      "Battery",
    ]);
    expect(chunks.every((c) => c.doc_id === "KD-01")).toBe(true);
  });

  it("prefixes each chunk with its section heading", () => {
    const chunks = chunkMarkdown("KD-01-x.md", md);
    const supervisor = chunks.find((c) => c.section === "Supervisor");
    expect(supervisor?.text.startsWith("Supervisor\n\n")).toBe(true);
    expect(supervisor?.text).toContain("Timeout is four seconds.");
  });

  it("numbers chunk_id per section slug", () => {
    const long = `${"para one. ".repeat(80)}\n\n${"para two. ".repeat(80)}`;
    expect(long.length).toBeGreaterThan(BODY_SPLIT_CHARS);
    const chunks = chunkMarkdown(
      "KD-02-x.md",
      `# Notes\n\n## Firmware 1.4.2 (2026-05-06)\n\n${long}\n`,
    );
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.every((c) => c.section.includes("1.4.2"))).toBe(true);
    expect(chunks[0]?.chunk_id).toBe("KD-02#firmware-1-4-2-2026-05-06#1");
    expect(chunks[1]?.chunk_id).toBe("KD-02#firmware-1-4-2-2026-05-06#2");
  });
});
