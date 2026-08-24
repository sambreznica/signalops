import type { TelemetryRecord } from "../fixtures/types";
import {
  correlateValue,
  isBinaryVariable,
  isOrdinalVariable,
  selectRows,
} from "./rows";
import type {
  CorrelateVariable,
  CorrelationMethod,
  CorrelationResult,
  TelemetryFilter,
} from "./types";

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function rank(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.value === indexed[i]!.value) {
      j += 1;
    }
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k]!.index] = avg;
    }
    i = j + 1;
  }
  return ranks;
}

function methodFor(
  x: CorrelateVariable,
  y: CorrelateVariable,
): CorrelationMethod {
  const binary = isBinaryVariable(x) || isBinaryVariable(y);
  const ordinal = isOrdinalVariable(x) || isOrdinalVariable(y);
  if (binary && ordinal) return "spearman";
  if (binary) return "point_biserial";
  if (ordinal) return "spearman";
  return "pearson";
}

export function correlate(
  rows: readonly TelemetryRecord[],
  x: CorrelateVariable,
  y: CorrelateVariable,
  filter: TelemetryFilter = {},
): CorrelationResult {
  const selected = selectRows(rows, filter);
  const xs = selected.map((row) => correlateValue(row, x));
  const ys = selected.map((row) => correlateValue(row, y));
  const method = methodFor(x, y);
  const coefficient =
    method === "spearman" ? pearson(rank(xs), rank(ys)) : pearson(xs, ys);
  return {
    pairing: [x, y],
    method,
    coefficient,
    n_pairs: selected.length,
    n_devices: new Set(selected.map((row) => row.device_id)).size,
  };
}
