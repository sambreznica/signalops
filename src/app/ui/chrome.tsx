import type { CertificationRun } from "../../../evals/artefact";
import { formatTimestamp } from "@/lib/replay/format";

export function Chrome({ run }: { run: CertificationRun }) {
  return (
    <p className="mono text-mute flex flex-wrap gap-x-3 gap-y-1">
      <span>replay</span>
      <span>ticket clock: run timestamp</span>
      <span>{run.run_id}</span>
      <span>{run.model}</span>
      <span>{formatTimestamp(run.timestamp)}</span>
      <a href={`/runs/${run.run_id}`}>{run.run_id}.json</a>
    </p>
  );
}
