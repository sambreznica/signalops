import type { SupportTag } from "../fixtures/constants";
import type { FeedbackRecord, TagTaxonomyEntry } from "../fixtures/types";
import type { TagStat } from "./types";

export function feedbackByTag(
  feedback: readonly FeedbackRecord[],
  taxonomy: readonly TagTaxonomyEntry[],
): TagStat[] {
  const tickets = new Map<SupportTag, Set<string>>();
  const devices = new Map<SupportTag, Set<string>>();
  for (const row of feedback) {
    for (const tag of row.tags) {
      let ticketSet = tickets.get(tag);
      if (!ticketSet) {
        ticketSet = new Set();
        tickets.set(tag, ticketSet);
      }
      ticketSet.add(row.id);
      let deviceSet = devices.get(tag);
      if (!deviceSet) {
        deviceSet = new Set();
        devices.set(tag, deviceSet);
      }
      deviceSet.add(row.device_id);
    }
  }

  return taxonomy.map((entry) => ({
    tag: entry.tag,
    consequence_class: entry.consequence_class,
    n_tickets: tickets.get(entry.tag)?.size ?? 0,
    n_devices: devices.get(entry.tag)?.size ?? 0,
  }));
}
