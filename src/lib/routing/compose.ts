import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  ticketHasBareNumeral,
  ticketHasFindingRef,
  type SkillId,
} from "../schema/ticket";
import type { EngineerRecord } from "./fixtures";
import type { RecommendedAction } from "../schema/investigation";

const TICKET_FIELD_NAMES = [
  "ticket_id",
  "title",
  "body",
  "queue",
  "assignee",
  "priority",
  "status",
  "source",
  "skills_required",
  "routing_rationale",
  "created_at",
  "due_at",
  "updated_at",
  "notes",
  "activity",
  "investigation_id",
  "action_id",
  "candidate_id",
] as const;

const BANNED_TITLE_WORDS = [
  ...TICKET_STATUSES,
  ...TICKET_PRIORITIES,
  ...TICKET_FIELD_NAMES,
] as const;

export function subjectFromCandidate(candidateId: string): {
  kind: "firmware" | "tag";
  text: string;
} {
  const fw = candidateId.match(/^cnd_fw_(.+)$/);
  if (fw) {
    return { kind: "firmware", text: fw[1]!.replace(/_/g, ".") };
  }
  const tag = candidateId.match(/^cnd_tag_(.+)$/);
  if (tag) {
    return { kind: "tag", text: tag[1]!.replace(/_/g, "-") };
  }
  return { kind: "tag", text: candidateId };
}

type TitleKind =
  | "rf_characterisation"
  | "phone_confound"
  | "counted_events"
  | "continue_monitoring"
  | "lot_split"
  | "do_not_close"
  | "clarification_copy"
  | "claims_breakdown"
  | "copy_review"
  | "cosmetic_ui"
  | "watch_step_change";

/** First match wins. Order is the freeze. */
export function detectActionKind(description: string): TitleKind | null {
  const d = description.toLowerCase();
  if (/\bsoak\b|re-characterisation|recharacterisation/.test(d)) {
    return "rf_characterisation";
  }
  if (/phone-os|stratification/.test(d)) return "phone_confound";
  if (/counted-events|connected-time/.test(d)) return "counted_events";
  if (/continue routine monitoring/.test(d)) return "continue_monitoring";
  if (/lot\/serial|\blot split\b/.test(d)) return "lot_split";
  if (/not to close|as expected behavior/.test(d)) return "do_not_close";
  if (/help-article|clarification/.test(d)) return "clarification_copy";
  if (/break down/.test(d)) return "claims_breakdown";
  if (/communications\/regulatory|copy review/.test(d)) return "copy_review";
  if (/battery\/app-ui|re-tag/.test(d)) return "cosmetic_ui";
  if (/no production|skin_temp_delta_c/.test(d)) return "watch_step_change";
  return null;
}

function sentenceCase(text: string): string {
  const trimmed = text.trim().replace(/\.+$/, "");
  if (trimmed.length === 0) return trimmed;
  return trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

function fallbackTitle(description: string): string {
  let text = description.trim();
  text = text.replace(
    /^(request|add|route|remind|re-run|continue|if|no)\b[:,]?\s+/i,
    "",
  );
  const clause = (text.split(/(?:\. |\n|;)/)[0] ?? text).replace(/\s+/g, " ").trim();
  const cut =
    clause.length <= 70
      ? clause
      : (() => {
          const slice = clause.slice(0, 70);
          const bound = slice.lastIndexOf(" ");
          return (bound > 40 ? slice.slice(0, bound) : slice).trim();
        })();
  return sentenceCase(cut.replace(/[,:;]+$/, ""));
}

function titleForKind(
  kind: TitleKind,
  subject: { kind: "firmware" | "tag"; text: string },
): string {
  const version = subject.kind === "firmware" ? subject.text : subject.text;
  const tag = subject.text;
  switch (kind) {
    case "rf_characterisation":
      return `RF characterisation for the ${version} supervisor-timing change`;
    case "phone_confound":
      return `Phone confound check on ${version} disconnects`;
    case "counted_events":
      return "Counted-events vs connected-time diagnostic";
    case "continue_monitoring":
      return `Continue monitoring ${tag} volume`;
    case "lot_split":
      return `Lot split for ${tag} tickets`;
    case "do_not_close":
      return `Do not close ${tag} as expected`;
    case "clarification_copy":
      return "Wellness-score clarification copy";
    case "claims_breakdown":
      return "Claims tickets by firmware and app version";
    case "copy_review":
      return "Copy review of on-screen readiness";
    case "cosmetic_ui":
      return "Confirm overheating tag is a known cosmetic UI issue";
    case "watch_step_change":
      return "Watch overheating tags for a step change";
  }
}

export function titleForbiddenHits(title: string): string[] {
  const hits: string[] = [];
  for (const word of BANNED_TITLE_WORDS) {
    const pattern = new RegExp(`\\b${word.replace(/_/g, "_")}\\b`, "i");
    if (pattern.test(title)) hits.push(word);
  }
  return hits;
}

export function composeTitle(args: {
  candidateId: string;
  action: Pick<RecommendedAction, "description">;
}): string {
  const subject = subjectFromCandidate(args.candidateId);
  const kind = detectActionKind(args.action.description);
  const title = kind
    ? titleForKind(kind, subject)
    : fallbackTitle(args.action.description);
  return sentenceCase(title);
}

export function composeBody(
  action: Pick<RecommendedAction, "description">,
): string {
  const text = action.description.trim();
  if (ticketHasFindingRef(text) || ticketHasBareNumeral(text)) {
    return "Work from this investigation. Figures stay on the investigation record.";
  }
  return text;
}

export function composeRationale(args: {
  expertise: string;
  fallback: "none" | "empty" | "bare_numeral" | "no_json";
  dropped: readonly string[];
  skills: readonly SkillId[];
  assignee: EngineerRecord | null;
  granted_missing: boolean;
}): string {
  const parts: string[] = [];
  if (args.fallback === "bare_numeral") {
    parts.push(
      "Assessor rationale contained a figure; treated as no usable skill.",
    );
  } else if (args.fallback === "no_json") {
    parts.push("Assessor returned no parseable object; treated as no usable skill.");
  } else if (args.fallback === "empty" || args.skills.length === 0) {
    parts.push("Assessor produced no usable skill.");
  } else if (args.expertise.trim().length > 0) {
    parts.push(args.expertise.trim());
  }
  if (args.dropped.length > 0) {
    parts.push(`Unknown skill ids dropped: ${args.dropped.join(", ")}.`);
  }
  if (args.granted_missing) {
    parts.push("Granted band was absent; priority used the LOW row.");
  }
  if (args.assignee) {
    const matched = args.assignee.skills.filter((s) =>
      args.skills.includes(s),
    );
    parts.push(
      `${args.assignee.name} selected: overlap ${matched.join(", ")}; under capacity; roster order as remaining tie.`,
    );
  } else if (args.skills.length > 0) {
    parts.push("No eligible engineer under capacity.");
  }
  return parts.join(" ");
}
