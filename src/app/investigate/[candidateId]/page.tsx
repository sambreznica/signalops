import Link from "next/link";
import { InvestigationView } from "@/app/ui/investigation-view";
import {
  loadChunkTextById,
  loadReplayRun,
  loadTriageCandidates,
  recordForCandidate,
} from "@/lib/replay/load";

export default async function InvestigationPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const run = loadReplayRun();
  const candidates = loadTriageCandidates();
  const candidate = candidates.find((c) => c.id === candidateId);
  const record = recordForCandidate(run, candidateId);
  const chunks = loadChunkTextById();

  if (!candidate) {
    return (
      <div>
        <h1 className="display">Unknown candidate</h1>
        <p className="label mt-1">{candidateId}</p>
        <p className="mt-2">
          <Link href="/">Command Centre</Link>
        </p>
      </div>
    );
  }

  if (!record) {
    return (
      <div>
        <h1 className="display">{candidateId}</h1>
        <p className="label mt-1">
          Triage only — no investigation in {run.run_id}
        </p>
        <p className="mt-2">
          <Link href="/">Command Centre</Link>
        </p>
      </div>
    );
  }

  return (
    <InvestigationView
      record={record}
      candidate={candidate}
      chunks={[...chunks.values()]}
      runId={run.run_id}
    />
  );
}
