import type { ConsequenceClass, SupportTag } from "../fixtures/constants";
import type { TrendDirection } from "../analytics/types";
import type { Quantity } from "../schema/quantity";

export type SeverityBand = "HIGH" | "MEDIUM" | "LOW";
export type CandidateKind = "tag" | "firmware";

export type SeverityInputs = {
  affected_users: number;
  fleet_size: number;
  rate_window: number;
  rate_prior: number;
  prior_events: number;
  trend: TrendDirection;
  consequence_class: ConsequenceClass;
};

export type SeverityResult = {
  affected_factor: number;
  ratio: number | null;
  delta_factor: number;
  delta_factor_floored: boolean;
  trend_factor: number;
  consequence_weight: number;
  severity_index: number;
  band: SeverityBand;
};

export type { UnionMatch, UnionMatchMember } from "./match";

export type TriageCandidate = {
  id: string;
  kind: CandidateKind;
  tag: SupportTag | null;
  firmware_version: string | null;
  consequence_class: ConsequenceClass;
  device_ids: string[];
  affected_users: Quantity;
  rate_window: Quantity;
  rate_prior: Quantity;
  delta_ratio: Quantity | null;
  prior_events: Quantity;
  ratio_ci_low: number | null;
  ratio_ci_high: number | null;
  ci_excludes_one: boolean;
  trend: TrendDirection;
  severity_index: Quantity;
  band: SeverityBand;
  delta_factor_floored: boolean;
  severity_inputs: SeverityInputs;
};
