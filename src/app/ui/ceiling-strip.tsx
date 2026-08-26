import type { CeilingRule, ConfidenceBand } from "@/lib/schema/investigation";
import { Panel } from "./panel";
import { BandMark } from "./status-mark";

type ConfidenceFields = {
  granted: ConfidenceBand | null;
  model_requested: ConfidenceBand;
  ceiling_rule_applied: CeilingRule | null;
};

const RULE_COPY: Record<CeilingRule, (asked: string) => string> = {
  correlational_evidence: (asked) =>
    `${asked} was refused: the evidence is correlational`,
  unrebutted_counter_evidence: (asked) =>
    `${asked} was refused: counter-evidence was not rebutted`,
  cohort_below_25: (asked) =>
    `${asked} was refused: the affected cohort is below 25`,
};

export function CeilingStrip({ confidence }: { confidence: ConfidenceFields }) {
  if (confidence.ceiling_rule_applied === null) return null;
  const granted = confidence.granted ?? "—";
  const asked = confidence.model_requested;
  const rule = confidence.ceiling_rule_applied;
  return (
    <Panel title="confidence" meta="ceiling" refuse>
      <p className="body font-medium">
        {RULE_COPY[rule](asked)}. Code granted {granted}.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <p className="label">requested</p>
          <p className="figure text-critical line-through decoration-critical">
            {asked}
          </p>
        </div>
        <p className="label pb-1" aria-hidden>
          →
        </p>
        <div>
          <p className="label">granted</p>
          {granted !== "—" ? (
            <p className="mt-1">
              <BandMark band={granted} />
            </p>
          ) : (
            <p className="figure">—</p>
          )}
        </div>
      </div>
      <p className="mono text-mute mt-3">{rule}</p>
    </Panel>
  );
}
