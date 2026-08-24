import { runAllEvals } from "./assertions";
import { loadHarnessContext } from "./load";
import { EVIDENCE_PATH } from "./paths";
import { formatResults, overallPass, writeEvidence } from "./report";

const ctx = loadHarnessContext();
const results = runAllEvals(ctx);
const body = formatResults("# Eval suite (agent)", results, [
  `run: ${ctx.run?.run_id ?? "none"}`,
  ctx.runError ? `artefact: ${ctx.runError}` : "artefact: loaded or not required for EVAL-01",
]);
console.log(body);
writeEvidence(EVIDENCE_PATH, body);
process.exit(overallPass(results) ? 0 : 1);
