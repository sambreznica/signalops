import type { SkillId } from "../schema/ticket";
import type { EngineerRecord } from "./fixtures";

export function composeTitle(actionId: string): string {
  return `Approved action ${actionId}`;
}

export function composeBody(): string {
  return "Work from this investigation. Figures stay on the investigation record.";
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
