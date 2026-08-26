import type { Quantity } from "@/lib/schema/quantity";
import { formatNumber } from "@/lib/replay/format";

export function QuantityView({ q }: { q: Quantity }) {
  return (
    <span className="font-mono text-[11px]">
      {formatNumber(q.value)} {q.unit}
    </span>
  );
}
