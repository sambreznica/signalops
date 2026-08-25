import type { FeedbackRecord } from "../../fixtures/types";
import type { SupportTag } from "../../fixtures/constants";
import type { SearchFeedbackArgs } from "./args";
import { FEEDBACK_SAMPLE_CAP, FEEDBACK_TEXT_CHARS } from "./caps";
import { asCount } from "./quantity";
import { evenlySpaced } from "./sample";
import type { ToolErr, ToolOk, ToolRuntime } from "./types";
import { resolveWindow } from "./windows";

export const FEEDBACK_SELECTION = "evenly_spaced_by_timestamp" as const;

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function recordHaystack(row: FeedbackRecord): string {
  return `${row.text} ${row.tags.join(" ")}`.toLowerCase();
}

function inWindow(timestamp: string, start: string, end: string): boolean {
  const day = timestamp.slice(0, 10);
  return day >= start && day <= end;
}

function matchesFilters(
  row: FeedbackRecord,
  args: SearchFeedbackArgs,
  start: string,
  end: string,
): boolean {
  if (!inWindow(row.timestamp, start, end)) return false;
  if (args.tag !== undefined && !row.tags.includes(args.tag)) return false;
  if (args.region !== undefined && row.region !== args.region) return false;
  if (
    args.firmware_version !== undefined &&
    row.firmware_version !== args.firmware_version
  ) {
    return false;
  }
  if (args.app_version !== undefined && row.app_version !== args.app_version) {
    return false;
  }
  return true;
}

function clipText(text: string): { text: string; text_truncated: boolean } {
  if (text.length <= FEEDBACK_TEXT_CHARS) {
    return { text, text_truncated: false };
  }
  return { text: text.slice(0, FEEDBACK_TEXT_CHARS), text_truncated: true };
}

export function runSearchFeedback(
  args: SearchFeedbackArgs,
  runtime: ToolRuntime,
  call_id: string,
): ToolOk | ToolErr {
  const tokens = queryTokens(args.query);
  if (tokens.length === 0) {
    return { ok: false, error: "query has no searchable tokens" };
  }

  const window_resolved = resolveWindow(args.window);
  const matches = runtime.feedback.filter((row) => {
    if (
      !matchesFilters(
        row,
        args,
        window_resolved.start,
        window_resolved.end,
      )
    ) {
      return false;
    }
    const hay = recordHaystack(row);
    return tokens.every((token) => hay.includes(token));
  });

  matches.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const sample = evenlySpaced(matches, FEEDBACK_SAMPLE_CAP);
  const byTag = new Map<SupportTag, number>();
  for (const entry of runtime.taxonomy) {
    byTag.set(entry.tag, 0);
  }
  for (const row of matches) {
    for (const tag of row.tags) {
      byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
    }
  }

  const tag_counts = runtime.taxonomy.map((entry) => ({
    tag: entry.tag,
    consequence_class: entry.consequence_class,
    n_tickets: asCount(byTag.get(entry.tag) ?? 0, "records", call_id),
  }));

  return {
    ok: true,
    window_resolved,
    n_matched: asCount(matches.length, "records", call_id),
    sample_size: asCount(sample.length, "records", call_id),
    sampled_from: asCount(matches.length, "records", call_id),
    selection: FEEDBACK_SELECTION,
    tag_counts,
    sample: sample.map((row) => {
      const clipped = clipText(row.text);
      return {
        id: row.id,
        timestamp: row.timestamp,
        channel: row.channel,
        device_id: row.device_id,
        firmware_version: row.firmware_version,
        app_version: row.app_version,
        region: row.region,
        tags: row.tags,
        text: clipped.text,
        text_truncated: clipped.text_truncated,
      };
    }),
  };
}
