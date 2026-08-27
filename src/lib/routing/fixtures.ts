import rosterJson from "../../../synthetic-data/roster.json";
import taxonomyJson from "../../../synthetic-data/skills-taxonomy.json";
import {
  QUEUE_IDS,
  SKILL_IDS,
  type SkillId,
  type TicketQueue,
} from "../schema/ticket";

export type SkillRecord = {
  id: SkillId;
  home_queue: TicketQueue;
  label: string;
  non_seeded_use: string;
};

export type EngineerRecord = {
  id: string;
  name: string;
  queue: TicketQueue;
  skills: SkillId[];
  wip_limit: number;
  timezone: string;
};

export function loadSkillsTaxonomy(): SkillRecord[] {
  return taxonomyJson as SkillRecord[];
}

export function loadRoster(): EngineerRecord[] {
  return rosterJson as EngineerRecord[];
}

export function skillHome(id: SkillId, taxonomy = loadSkillsTaxonomy()): TicketQueue {
  const row = taxonomy.find((s) => s.id === id);
  if (!row) throw new Error(`unknown skill ${id}`);
  return row.home_queue;
}

export function engineerById(
  id: string,
  roster = loadRoster(),
): EngineerRecord | undefined {
  return roster.find((e) => e.id === id);
}

export const CLOSED_SKILL_IDS: readonly SkillId[] = SKILL_IDS;
export const CLOSED_QUEUE_IDS: readonly TicketQueue[] = QUEUE_IDS;
