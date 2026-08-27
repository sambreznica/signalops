import type { InvestigationOutput, RecommendedAction } from "../schema/investigation";
import type { Ticket } from "../schema/ticket";
import { assessSkillsAction } from "./assess-action";
import { packFromInvestigation } from "./assessor-prompt";
import { boardNow, type BoardClockMode } from "./clock";
import { loadRoster, loadSkillsTaxonomy } from "./fixtures";
import {
  existingForAction,
  mergeTickets,
  route,
  type AssessorEmit,
} from "./route";

export async function createTicketAfterApproval(args: {
  action: RecommendedAction;
  output: InvestigationOutput;
  candidateId: string;
  runId: string;
  runTimestamp: string;
  mode: BoardClockMode;
  existing: readonly Ticket[];
  committed: readonly Ticket[];
}): Promise<Ticket> {
  const existing = mergeTickets(args.existing, args.committed);
  const found = existingForAction(
    existing,
    args.output.investigation_id,
    args.action.action_id,
  );
  if (found) return found;

  let emit: AssessorEmit | null = null;
  const live = await assessSkillsAction(packFromInvestigation(args.action, args.output));
  if (live.ok) emit = live.emit;
  if (!emit) {
    emit = {
      skills_required: [],
      expertise_rationale: "",
      fallback: "no_json",
    };
  }

  return route({
    action: args.action,
    investigation_id: args.output.investigation_id,
    candidate_id: args.candidateId,
    granted: args.output.confidence.granted,
    existing,
    now: boardNow({ mode: args.mode, runTimestamp: args.runTimestamp }),
    roster: loadRoster(),
    taxonomy: loadSkillsTaxonomy(),
    assessor: emit,
  });
}
