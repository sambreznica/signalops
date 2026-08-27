import { QUEUE_TIE_BREAK, type SkillId, type TicketQueue } from "../schema/ticket";
import { loadSkillsTaxonomy, type SkillRecord } from "./fixtures";

/** Mode of skill homes. Tie-break: firmware, hardware, product_comms, data_telemetry. */
export function queueFromSkills(
  skills: readonly SkillId[],
  taxonomy: SkillRecord[] = loadSkillsTaxonomy(),
): TicketQueue | null {
  if (skills.length === 0) return null;
  const counts = new Map<TicketQueue, number>();
  for (const id of skills) {
    const row = taxonomy.find((s) => s.id === id);
    if (!row) continue;
    counts.set(row.home_queue, (counts.get(row.home_queue) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: TicketQueue | null = null;
  let bestCount = -1;
  for (const queue of QUEUE_TIE_BREAK) {
    const n = counts.get(queue) ?? 0;
    if (n > bestCount) {
      best = queue;
      bestCount = n;
    }
  }
  return bestCount > 0 ? best : null;
}
