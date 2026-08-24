import { eval01, eval02, eval03, eval06, eval07, eval10 as assertEval10 } from "./assertions";
import { loadHarnessContext } from "./load";
import { BASELINE_SCOPE, formatResults } from "./report";
import type { EvalResult } from "./types";

const ctx = loadHarnessContext();
const results: EvalResult[] = [
  eval01(ctx),
  eval02(ctx),
  eval03(ctx),
  eval06(ctx),
  eval07(ctx),
  assertEval10(ctx),
];

const body = formatResults("# Baseline (neutral subset)", results, [
  BASELINE_SCOPE,
  `run: ${ctx.run?.run_id ?? "none"} (kind=${ctx.run?.kind ?? "n/a"})`,
]);
console.log(body);

const eval10 = results.find((r) => r.id === "EVAL-10");
const ok = results.every((r) => r.pass) && Boolean(eval10?.pass);
process.exit(ok ? 0 : 1);
