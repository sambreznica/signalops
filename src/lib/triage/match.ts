export const MATCH_PRECISION_MIN = 0.5;
export const MATCH_UNION_COVERAGE_MIN = 0.7;

export function deviceJaccard(a: readonly string[], b: readonly string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size === 0 && bSet.size === 0) return 1;
  let overlap = 0;
  for (const id of aSet) {
    if (bSet.has(id)) overlap += 1;
  }
  const denom = aSet.size + bSet.size - overlap;
  return denom === 0 ? 0 : overlap / denom;
}

/** |intersection| / |reference| — fraction of the reference the candidate covers. */
export function deviceCoverage(
  candidateIds: readonly string[],
  referenceIds: readonly string[],
): number {
  if (referenceIds.length === 0) return 0;
  const cand = new Set(candidateIds);
  let overlap = 0;
  for (const id of referenceIds) {
    if (cand.has(id)) overlap += 1;
  }
  return overlap / referenceIds.length;
}

/** |intersection| / |candidate| — fraction of the candidate that sits in the reference. */
export function devicePrecision(
  candidateIds: readonly string[],
  referenceIds: readonly string[],
): number {
  const cand = [...new Set(candidateIds)];
  if (cand.length === 0) return 0;
  const ref = new Set(referenceIds);
  let overlap = 0;
  for (const id of cand) {
    if (ref.has(id)) overlap += 1;
  }
  return overlap / cand.length;
}

export type OverlapSubject = {
  id: string;
  device_ids: readonly string[];
};

export type UnionMatchMember = {
  candidate_id: string;
  precision: number;
  coverage: number;
  jaccard: number;
};

export type UnionMatch = {
  reference_id: string;
  matched: boolean;
  match_set: UnionMatchMember[];
  union_coverage: number;
  primary: UnionMatchMember | null;
};

function member(
  candidate: OverlapSubject,
  reference: OverlapSubject,
): UnionMatchMember {
  return {
    candidate_id: candidate.id,
    precision: devicePrecision(candidate.device_ids, reference.device_ids),
    coverage: deviceCoverage(candidate.device_ids, reference.device_ids),
    jaccard: deviceJaccard(candidate.device_ids, reference.device_ids),
  };
}

function overlapCount(
  candidateIds: readonly string[],
  referenceSet: ReadonlySet<string>,
): number {
  let n = 0;
  for (const id of new Set(candidateIds)) {
    if (referenceSet.has(id)) n += 1;
  }
  return n;
}

/**
 * Eligible if |∩| / |candidate| ≥ 0.5 (majority-about this signal).
 * Greedy add by marginal coverage of the signal. MATCHED when union coverage ≥ 0.7.
 * Primary is highest individual coverage, Jaccard tie-break.
 */
export function unionCoverageMatch(
  candidates: readonly OverlapSubject[],
  references: readonly OverlapSubject[],
  precisionMin: number = MATCH_PRECISION_MIN,
  unionMin: number = MATCH_UNION_COVERAGE_MIN,
): UnionMatch[] {
  return references.map((reference) => {
    const refSet = new Set(reference.device_ids);
    const eligible = candidates
      .map((candidate) => ({ candidate, stats: member(candidate, reference) }))
      .filter((row) => row.stats.precision >= precisionMin);

    const remaining = [...eligible];
    const selected: UnionMatchMember[] = [];
    const covered = new Set<string>();

    while (remaining.length > 0) {
      let bestIdx = -1;
      let bestGain = 0;
      let bestJaccard = -1;
      for (let i = 0; i < remaining.length; i++) {
        const row = remaining[i]!;
        let gain = 0;
        for (const id of new Set(row.candidate.device_ids)) {
          if (refSet.has(id) && !covered.has(id)) gain += 1;
        }
        if (
          gain > bestGain ||
          (gain === bestGain && gain > 0 && row.stats.jaccard > bestJaccard)
        ) {
          bestGain = gain;
          bestJaccard = row.stats.jaccard;
          bestIdx = i;
        }
      }
      if (bestGain <= 0 || bestIdx < 0) break;
      const picked = remaining.splice(bestIdx, 1)[0]!;
      selected.push(picked.stats);
      for (const id of picked.candidate.device_ids) {
        if (refSet.has(id)) covered.add(id);
      }
    }

    remaining.sort(
      (a, b) => b.stats.coverage - a.stats.coverage || b.stats.jaccard - a.stats.jaccard,
    );
    for (const row of remaining) selected.push(row.stats);

    const union_coverage =
      refSet.size === 0 ? 0 : covered.size / refSet.size;
    const primary =
      [...selected].sort(
        (a, b) => b.coverage - a.coverage || b.jaccard - a.jaccard,
      )[0] ?? null;

    return {
      reference_id: reference.id,
      matched: union_coverage >= unionMin,
      match_set: selected,
      union_coverage,
      primary,
    };
  });
}
