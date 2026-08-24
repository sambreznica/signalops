import type { Quantity } from "../schema/quantity";

export function triageQuantity(
  value: number,
  unit: string,
  candidateId: string,
): Quantity {
  return {
    value,
    unit,
    source: { kind: "triage", signal_id: candidateId },
  };
}
