import type { Measured } from "../../analytics/types";
import type { Quantity } from "../../schema";

/** The only Measured → Quantity path. `call_id` is minted by `invoke`. */
export function asQuantity(measured: Measured, call_id: string): Quantity {
  return {
    value: measured.value,
    unit: measured.unit,
    source: { kind: "tool_call", call_id },
  };
}

export function asCount(
  value: number,
  unit: string,
  call_id: string,
): Quantity {
  return asQuantity({ value, unit }, call_id);
}
