import type { ConfidenceBand, Status } from "@/lib/schema/investigation";
import type { SeverityBand } from "@/lib/triage/types";

type Band = ConfidenceBand | SeverityBand;

function bandChip(band: Band): string {
  if (band === "HIGH") return "chip chip-critical";
  if (band === "MEDIUM") return "chip chip-elevated";
  return "chip chip-inert";
}

export function BandMark({ band }: { band: Band }) {
  return <span className={bandChip(band)}>{band}</span>;
}

export function StatusMark({
  status,
}: {
  status: Status | "NOT_INVESTIGATED";
}) {
  if (status === "NOT_INVESTIGATED") {
    return <span className="chip chip-inert">not investigated</span>;
  }
  if (status === "NOT_AN_INCIDENT") {
    return <span className="chip chip-settled">{status}</span>;
  }
  if (status === "CONFIRMED") {
    return <span className="chip chip-settled">{status}</span>;
  }
  if (status === "UNCERTAIN") {
    return <span className="chip chip-elevated">{status}</span>;
  }
  return <span className="chip chip-inert">{status}</span>;
}

export function AltStatusMark({
  status,
}: {
  status: "weakened" | "open" | "rejected";
}) {
  if (status === "rejected") return <span className="chip chip-inert">{status}</span>;
  if (status === "weakened") return <span className="chip chip-elevated">{status}</span>;
  return <span className="chip chip-inert">{status}</span>;
}
