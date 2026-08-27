import { EVAL_IDS, type EvalId, type EvalResult } from "../../../evals/types";
import {
  DEFAULT_RUN_ID,
  loadAgentRuns,
  scoreAgentRuns,
} from "@/lib/replay/load";
import { Panel } from "@/app/ui/panel";

const EVAL_LABEL: Record<EvalId, string> = {
  "EVAL-01": "SIG-001 present in triage, HIGH",
  "EVAL-02": "firmware 1.4.2 identified",
  "EVAL-03": "KD-02 §1.4.2 chunk retrieved",
  "EVAL-04": "claim discipline",
  "EVAL-05": "critic effect",
  "EVAL-06": "SIG-003 claims-risk + KD-05",
  "EVAL-07": "no medical output",
  "EVAL-08": "approval gate",
  "EVAL-09": "knowledge claims resolve to chunk ids",
  "EVAL-10": "SIG-004 terminal status NOT_AN_INCIDENT",
};

function Cell({ result }: { result: EvalResult | undefined }) {
  if (!result) return <span className="mono text-mute">—</span>;
  return (
    <span className={`mono font-medium ${result.pass ? "text-ink" : "text-mute"}`}>
      {result.pass ? "pass" : "fail"}
    </span>
  );
}

export default function EvaluationsPage() {
  const scored = scoreAgentRuns(loadAgentRuns());
  const replay = scored.find((s) => s.run.run_id === DEFAULT_RUN_ID);

  const rows = EVAL_IDS.map((id) => {
    const cells = scored.map((s) => s.results.find((r) => r.id === id));
    const passed = cells.filter((c) => c?.pass).length;
    return {
      id,
      cells,
      passed,
      n: cells.length,
    };
  });

  const replayPassed = replay?.results.filter((r) => r.pass).length ?? 0;
  const replayEval06 = replay?.results.find((r) => r.id === "EVAL-06");

  return (
    <div>
      <h1 className="display">Evaluations</h1>
      <p className="label mt-1">
        pass rates across committed agent runs · EVAL-10 is blocking
      </p>

      <Panel className="mt-3" title="matrix" meta={`${scored.length} runs`} flush>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="label border-b border-rule">
              <th className="px-4 py-2 font-normal">eval</th>
              <th className="px-3 py-2 font-normal">rate</th>
              {scored.map((s) => (
                <th key={s.run.run_id} className="px-3 py-2 font-normal mono">
                  {s.run.run_id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`align-top ${
                  row.id === "EVAL-10"
                    ? "border-t-2 border-ink"
                    : "border-t border-rule"
                }`}
              >
                <td className="px-4 py-2">
                  <p className="mono font-medium">
                    {row.id}
                    {row.id === "EVAL-10" ? (
                      <span className="label ml-2">blocking</span>
                    ) : null}
                  </p>
                  <p className="dense text-mute">{EVAL_LABEL[row.id]}</p>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="mono font-medium tabular-nums">
                      {row.passed}/{row.n}
                    </span>
                    <span className="mag w-16">
                      <span
                        className="mag-fill mag-settled"
                        style={{
                          width: `${row.n === 0 ? 0 : (row.passed / row.n) * 100}%`,
                        }}
                      />
                    </span>
                  </div>
                </td>
                {row.cells.map((cell, i) => (
                  <td key={scored[i]!.run.run_id} className="px-3 py-2">
                    <Cell result={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {replay ? (
        <p className="mt-3 dense text-mute max-w-[40rem]">
          Current replay {replay.run.run_id} is {replayPassed}/10.
          {replayEval06 && !replayEval06.pass
            ? " EVAL-06 failed on this run because claims terminated validation_exhausted."
            : ""}{" "}
          Rates across runs will move; this page does not freeze a single-run
          slogan.
        </p>
      ) : null}
    </div>
  );
}
