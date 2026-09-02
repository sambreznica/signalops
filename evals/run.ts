import { runAllEvals } from "./assertions";
import { BASELINE_RUN_ID } from "./baseline-stamp";
import { loadHarnessContext, loadRunById } from "./load";
import { runNeutralEvals } from "./neutral";
import { EVIDENCE_PATH } from "./paths";
import {
  BASELINE_HEADING,
  BASELINE_LINE_TAG,
  BASELINE_SCOPE,
  formatResults,
  mergeBaselineSection,
  overallPass,
  writeEvidence,
} from "./report";

const ctx = loadHarnessContext();
const results = runAllEvals(ctx);
const agentBody = formatResults("# Eval suite (agent)", results, [
  `run: ${ctx.run?.run_id ?? "none"}`,
  ctx.runError ? `artefact: ${ctx.runError}` : "artefact: loaded or not required for EVAL-01",
]);
console.log(agentBody);

const baselineRun = loadRunById(BASELINE_RUN_ID);
const baselineSection = baselineRun
  ? formatResults(
      BASELINE_HEADING,
      runNeutralEvals({ ...ctx, run: baselineRun, runError: null }),
      [
        BASELINE_SCOPE,
        `run: ${baselineRun.run_id} (kind=${baselineRun.kind})`,
        `model: ${baselineRun.model}`,
        `effort: ${baselineRun.effort}`,
        `n: ${baselineRun.n}`,
        `tool_calls: ${baselineRun.investigations.reduce((n, row) => n + row.metrics.tool_calls, 0)}`,
        `tokens: ${baselineRun.investigations.reduce((n, row) => n + row.metrics.tokens, 0)}`,
        `wall_clock_ms: ${baselineRun.investigations.reduce((n, row) => n + row.metrics.wall_clock_ms, 0)}`,
        `rescored from committed artefact; no model call`,
        `trace: empty on every investigation (EVAL-02 cannot pass by invented tool use)`,
      ],
      BASELINE_LINE_TAG,
    )
  : null;

if (baselineSection) {
  console.log("");
  console.log(baselineSection);
}

writeEvidence(
  EVIDENCE_PATH,
  baselineSection ? mergeBaselineSection(agentBody, baselineSection) : agentBody,
);
process.exit(overallPass(results) ? 0 : 1);
