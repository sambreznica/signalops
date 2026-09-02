import { eval01, eval02, eval03, eval06, eval07, eval10 } from "./assertions";
import type { HarnessContext } from "./load";
import type { EvalResult } from "./types";

/** Architecture-neutral subset. The baseline cannot pass 04/05/08/09 by construction. */
export function runNeutralEvals(ctx: HarnessContext): EvalResult[] {
  return [eval01(ctx), eval02(ctx), eval03(ctx), eval06(ctx), eval07(ctx), eval10(ctx)];
}
