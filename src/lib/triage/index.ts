export {
  CONSEQUENCE_WEIGHT,
  FLEET_SATURATION_FRACTION,
  HIGH_THRESHOLD,
  MEDIUM_THRESHOLD,
  THIN_PRIOR_DELTA_CAP,
  THIN_PRIOR_EVENTS,
} from "./constants";
export { firmwareCandidateId, tagCandidateId } from "./ids";
export {
  deviceCoverage,
  deviceJaccard,
  devicePrecision,
  MATCH_PRECISION_MIN,
  MATCH_UNION_COVERAGE_MIN,
  unionCoverageMatch,
} from "./match";
export { runTriage } from "./run";
export { computeSeverity } from "./severity";
export type {
  CandidateKind,
  SeverityBand,
  SeverityInputs,
  SeverityResult,
  TriageCandidate,
  UnionMatch,
  UnionMatchMember,
} from "./types";
