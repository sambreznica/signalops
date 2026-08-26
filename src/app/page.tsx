import { CommandCentre } from "./ui/command-centre";
import {
  loadReplayRun,
  loadTriageCandidates,
  recordForCandidate,
} from "@/lib/replay/load";

export default function CommandCentrePage() {
  const run = loadReplayRun();
  const candidates = loadTriageCandidates();
  const rows = candidates.map((candidate) => ({
    candidate: { ...candidate, device_ids: [] },
    status: recordForCandidate(run, candidate.id)?.output.status ?? null,
  }));
  return (
    <CommandCentre
      runId={run.run_id}
      model={run.model}
      timestamp={run.timestamp}
      rows={rows}
    />
  );
}
