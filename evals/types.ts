export const EVAL_IDS = [
  "EVAL-01",
  "EVAL-02",
  "EVAL-03",
  "EVAL-04",
  "EVAL-05",
  "EVAL-06",
  "EVAL-07",
  "EVAL-08",
  "EVAL-09",
  "EVAL-10",
] as const;

export type EvalId = (typeof EVAL_IDS)[number];

/** Neutral subset the single-call baseline may attempt. */
export const NEUTRAL_EVAL_IDS = [
  "EVAL-01",
  "EVAL-02",
  "EVAL-03",
  "EVAL-06",
  "EVAL-07",
  "EVAL-10",
] as const;

export type NeutralEvalId = (typeof NEUTRAL_EVAL_IDS)[number];

export const ARCHITECTURE_ONLY_EVAL_IDS = [
  "EVAL-04",
  "EVAL-05",
  "EVAL-08",
  "EVAL-09",
] as const;

export type Subcheck = {
  id: string;
  pass: boolean;
  reason: string;
};

export type EvalResult = {
  id: EvalId;
  pass: boolean;
  expected: string;
  actual: string;
  reason: string;
  blocking?: boolean;
  subchecks?: Subcheck[];
};
