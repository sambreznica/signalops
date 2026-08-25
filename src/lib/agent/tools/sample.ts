/**
 * Deterministic subsample that spans an ordered set instead of taking the
 * first n (which would cluster on whichever records sort first).
 *
 * Indices are `floor(i * (length - 1) / (n - 1))` for i in 0..n-1, so the
 * first and last items are always included when n ≥ 2.
 */
export function evenlySpacedIndices(length: number, n: number): number[] {
  if (length <= 0 || n <= 0) return [];
  const take = Math.min(n, length);
  if (take === 1) return [0];
  const indices: number[] = [];
  for (let i = 0; i < take; i++) {
    indices.push(Math.floor((i * (length - 1)) / (take - 1)));
  }
  return indices;
}

export function evenlySpaced<T>(items: readonly T[], n: number): T[] {
  return evenlySpacedIndices(items.length, n).map((i) => items[i]!);
}
