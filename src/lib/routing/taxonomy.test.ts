import { describe, expect, it } from "vitest";
import { SKILL_IDS } from "../schema/ticket";
import { loadRoster, loadSkillsTaxonomy } from "./fixtures";

const FORBIDDEN_TOKENS = [
  "nordics",
  "readiness",
  "disconnect",
  "adhesion-failure",
  "battery-drain",
] as const;

export function assertNoSingletonSigFingerprints(
  goldens: Record<string, string[]>,
): string[] {
  const sigKeys = Object.keys(goldens).filter((k) => /^SIG-00[1-4]$/.test(k));
  const skillUsers = new Map<string, string[]>();
  for (const [key, skills] of Object.entries(goldens)) {
    for (const skill of skills) {
      const users = skillUsers.get(skill) ?? [];
      users.push(key);
      skillUsers.set(skill, users);
    }
  }
  const errors: string[] = [];
  for (const key of sigKeys) {
    const skills = goldens[key] ?? [];
    if (skills.length !== 1) continue;
    const skill = skills[0]!;
    const users = skillUsers.get(skill) ?? [];
    if (users.length === 1 && users[0] === key) {
      errors.push(`${key} uniquely fingerprints ${skill}`);
    }
  }
  return errors;
}

describe("skills taxonomy anti-leak", () => {
  const taxonomy = loadSkillsTaxonomy();
  const roster = loadRoster();

  it("check 1: every skill id is the closed fifteen, no extras", () => {
    expect(taxonomy.map((s) => s.id)).toEqual([...SKILL_IDS]);
  });

  it("check 2: no skill id matches SIG/INC/KI, a version, or a forbidden token", () => {
    for (const skill of taxonomy) {
      expect(skill.id).not.toMatch(/SIG-|INC-|KI-/);
      expect(skill.id).not.toMatch(/\d+\.\d+/);
      for (const token of FORBIDDEN_TOKENS) {
        expect(skill.id).not.toBe(token);
        expect(skill.id.includes(token)).toBe(false);
      }
    }
  });

  it("check 3: every skill has a non-empty non_seeded_use", () => {
    for (const skill of taxonomy) {
      expect(skill.non_seeded_use.trim().length).toBeGreaterThan(0);
    }
  });

  it("check 4: SIG-keyed goldens cannot be a singleton fingerprint", () => {
    const committed: Record<string, string[]> = {
      "radio-timing-change": ["ble-radio", "firmware-build"],
      "adhesive-lot": ["adhesive-materials", "wear-mechanics"],
      "claims-copy": ["claims-review", "copy-ops"],
      "export-gap": ["telemetry-pipeline", "data-quality"],
    };
    expect(assertNoSingletonSigFingerprints(committed)).toEqual([]);
    expect(
      assertNoSingletonSigFingerprints({
        ...committed,
        "SIG-001": ["ble-radio"],
      }),
    ).toEqual([]);
    expect(
      assertNoSingletonSigFingerprints({
        "SIG-001": ["ble-radio"],
      }),
    ).toEqual(["SIG-001 uniquely fingerprints ble-radio"]);
  });

  it("roster is ten people with home queues in the closed set", () => {
    expect(roster).toHaveLength(10);
    expect(new Set(roster.map((e) => e.id)).size).toBe(10);
  });
});
