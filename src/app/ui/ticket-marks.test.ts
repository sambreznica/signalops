import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "../../lib/schema/ticket";
import { IN_PROGRESS_GAUGE, IN_REVIEW_GAUGE, assigneeInitials } from "./ticket-marks";

const SRC = readFileSync(
  path.resolve(import.meta.dirname, "ticket-marks.tsx"),
  "utf8",
);

describe("status icons and priority glyphs", () => {
  it("draws every status on a 14px circle and uses a gauge sector for in-progress work", () => {
    expect(SRC).toContain('viewBox="0 0 14 14"');
    expect(SRC).toContain("strokeDasharray");
    expect(IN_PROGRESS_GAUGE).toBe(0.4);
    expect(IN_REVIEW_GAUGE).toBe(0.85);
    for (const status of TICKET_STATUSES) {
      expect(SRC).toContain(`status === "${status}"`);
    }
  });

  it("keeps BLOCKED and CANCELLED grey, not danger, and has no NONE priority", () => {
    expect(SRC).toContain('status === "BLOCKED" || status === "CANCELLED"');
    expect(SRC).toContain("is-muted");
    expect(SRC).not.toMatch(/BLOCKED[\s\S]{0,200}is-urgent/);
    expect(SRC).not.toContain("NONE");
    expect(TICKET_PRIORITIES).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);
    expect(SRC).toContain("is-urgent");
  });

  it("renders initials, not photos", () => {
    expect(assigneeInitials("Priya Nair")).toBe("PN");
    expect(assigneeInitials("Samira El-Sayed")).toBe("SE");
    expect(SRC.includes("<img")).toBe(false);
    expect(SRC.toLowerCase().includes("photo")).toBe(false);
    expect(SRC.includes("avatar")).toBe(false);
  });
});
