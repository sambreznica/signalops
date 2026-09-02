import { Suspense } from "react";
import { BoardView } from "@/app/ui/board-view";
import {
  loadChunkTextById,
  loadReplayRun,
  loadTicketsArtefact,
} from "@/lib/replay/load";

export default function BoardPage() {
  const run = loadReplayRun();
  const committed = loadTicketsArtefact(run.run_id);
  const chunks = loadChunkTextById();
  return (
    <Suspense>
      <BoardView
        runId={run.run_id}
        runTimestamp={run.timestamp}
        committedTickets={committed?.tickets ?? []}
        records={run.investigations}
        chunks={[...chunks.values()]}
      />
    </Suspense>
  );
}
