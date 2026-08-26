"use client";

import { useState } from "react";
import type { InvestigationRecord } from "../../../evals/artefact";
import type { Chunk } from "@/lib/retrieval/types";
import type {
  DeterministicFinding,
  InvestigationOutput,
} from "@/lib/schema/investigation";
import type { Provenance } from "@/lib/schema/quantity";
import type { TriageCandidate } from "@/lib/triage/types";
import {
  altOutcomeCopy,
  carryFindings,
  ceilingCopy,
  evidenceTypeCopy,
  formatMultiplier,
  headlineComparison,
  needsSignOff,
  riskClassCopy,
  statusToneClass,
  stopReasonCopy,
} from "@/lib/replay/copy";
import { formatNumber, formatQuantity, slugId } from "@/lib/replay/format";
import { FindingText } from "./finding-text";
import { Panel } from "./panel";
import { BandMark, AltStatusMark, StatusMark } from "./status-mark";
import { Trace } from "./trace";
import { MagBar } from "./bars";

function sourceChip(
  source: Provenance,
  hot: boolean,
  onCall: (id: string) => void,
) {
  if (source.kind === "tool_call") {
    return (
      <button
        type="button"
        className={`chip ${hot ? "chip-elevated" : "chip-inert"}`}
        onClick={() => onCall(source.call_id)}
      >
        {source.call_id}
      </button>
    );
  }
  if (source.kind === "triage") {
    return <span className="chip chip-inert">{source.signal_id}</span>;
  }
  return (
    <a href={`/knowledge#${slugId(source.chunk_id)}`} className="chip chip-inert">
      {source.chunk_id}
    </a>
  );
}

function Prose({
  text,
  findings,
  quiet,
  hotCall,
  onCall,
}: {
  text: string;
  findings: readonly DeterministicFinding[];
  quiet?: boolean;
  hotCall: string | null;
  onCall?: (id: string) => void;
}) {
  return (
    <p className={`body ${quiet ? "text-mute" : ""}`}>
      <FindingText
        text={text}
        findings={findings}
        hotCall={hotCall}
        onCall={onCall}
      />
    </p>
  );
}

function subjectOf(c: TriageCandidate): string {
  if (c.kind === "firmware") return `firmware ${c.firmware_version ?? ""}`;
  return c.tag ?? c.id;
}

function supportingPassage(
  output: InvestigationOutput,
  byChunk: Map<string, Chunk>,
): { chunkId: string; text: string } | null {
  const fromSupport = output.supporting_evidence.find(
    (e) => e.source.kind === "knowledge",
  );
  const chunkId =
    fromSupport && fromSupport.source.kind === "knowledge"
      ? fromSupport.source.chunk_id
      : output.knowledge_sources[0]?.chunk_id;
  if (!chunkId) return null;
  const chunk = byChunk.get(chunkId);
  const fallbackClaim =
    fromSupport && fromSupport.source.kind === "knowledge"
      ? fromSupport.claim
      : null;
  const text = chunk?.text ?? fallbackClaim;
  if (!text) return null;
  return { chunkId, text };
}

function criticSkipWhy(record: InvestigationRecord): string {
  const reason = record.stop_reason;
  if (reason && reason !== "completed") return stopReasonCopy(reason);
  return "There was no leading hypothesis to falsify.";
}

export function InvestigationView({
  record,
  candidate,
  chunks,
  runId,
}: {
  record: InvestigationRecord;
  candidate: TriageCandidate;
  chunks: Chunk[];
  runId: string;
}) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const output: InvestigationOutput = record.output;
  const findings = output.deterministic_findings;
  const byChunk = new Map(chunks.map((c) => [c.chunk_id, c]));
  const synthesized =
    record.stop_reason === undefined || record.stop_reason === "completed";
  const toolCalls = output.trace.filter((e) => e.kind === "tool_call").length;
  const maxScore = Math.max(
    0.001,
    ...output.knowledge_sources.map((k) => k.score),
  );
  const ceiling = output.confidence.ceiling_rule_applied;
  const granted = output.confidence.granted;
  const pair = headlineComparison(findings);
  const promoted = carryFindings(findings, pair);
  const passage = supportingPassage(output, byChunk);
  const criticEffects = output.trace.filter((e) => e.kind === "critic_effect");
  const skipped = criticEffects.find((e) => e.effect === "skipped");
  const abandoned = criticEffects.find((e) => e.effect === "abandoned");
  const howItEnded = synthesized
    ? `Completed · ${toolCalls} calls · ${Math.round(record.metrics.wall_clock_ms / 1000)}s`
    : `${stopReasonCopy(record.stop_reason)} · ${toolCalls} calls · ${Math.round(record.metrics.wall_clock_ms / 1000)}s`;
  const verdictLine = synthesized
    ? output.title
    : stopReasonCopy(record.stop_reason);

  function selectCall(id: string) {
    setSelectedCallId(id);
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <article>
      <section className="panel mb-3 px-5 py-5">
        <p className="label mb-2">Verdict</p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className={`verdict-status m-0 ${statusToneClass(output.status)}`}>
            {output.status}
          </h1>
          {output.status === "NOT_AN_INCIDENT" ? (
            <>
              <StatusMark status={output.status} />
              <span className="dense text-settled">no action needed</span>
            </>
          ) : null}
        </div>
        <p className={`mt-3 ${synthesized ? "body" : "body text-mute"}`}>
          {verdictLine}
        </p>
        {pair ? (
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="figure">{formatNumber(pair.left.value)}</p>
              <p className="dense text-graphite mt-1">{pair.left.label}</p>
            </div>
            <p className="label pb-1 text-mute">vs</p>
            <div>
              <p className="figure">{formatNumber(pair.right.value)}</p>
              <p className="dense text-graphite mt-1">{pair.right.label}</p>
            </div>
            <p className="figure pb-0.5">
              {formatMultiplier(pair.ratio)}
            </p>
            <p className="mono text-mute pb-1">{pair.left.unit}</p>
          </div>
        ) : null}
        <dl className="mt-4 pt-3 border-t border-rule flex flex-wrap gap-x-6 gap-y-2 dense">
          <div>
            <dt className="label">Candidate</dt>
            <dd className="mono m-0">{candidate.id}</dd>
          </div>
          <div>
            <dt className="label">Subject</dt>
            <dd className="m-0">{subjectOf(candidate)}</dd>
          </div>
          <div>
            <dt className="label">Cohort</dt>
            <dd className="m-0">{formatQuantity(output.affected_cohort)}</dd>
          </div>
          <div>
            <dt className="label">How it ended</dt>
            <dd className="m-0">{howItEnded}</dd>
          </div>
        </dl>
      </section>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.63fr)_minmax(0,1fr)] lg:items-start lg:gap-3">
        <div className="stack">
          <Panel title="The case">
            <p className="mb-2">
              <span className="chip chip-inert">
                {evidenceTypeCopy(output.leading_hypothesis.evidence_type)}
              </span>
              {!synthesized ? (
                <span className="label ml-2">not synthesized</span>
              ) : null}
            </p>
            <Prose
              text={output.leading_hypothesis.statement}
              findings={findings}
              quiet={!synthesized}
              hotCall={selectedCallId}
              onCall={selectCall}
            />
            {promoted.length > 0 ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {promoted.map((f) => {
                  const hot =
                    f.source.kind === "tool_call" &&
                    f.source.call_id === selectedCallId;
                  return (
                    <li
                      key={f.id}
                      className={`border border-rule rounded p-2 ${hot ? "cell-elevated" : ""}`}
                    >
                      <p className="mono text-mute">{f.id}</p>
                      <p className="figure mt-1">{formatNumber(f.value)}</p>
                      <p className="mono text-mute">{f.unit}</p>
                      <p className="dense mt-1">{f.label}</p>
                      <div className="mt-1">
                        {sourceChip(f.source, hot, selectCall)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {passage ? (
              <blockquote className="mt-4 border-l-2 border-ink bg-paper px-3 py-2 m-0">
                <p className="dense whitespace-pre-wrap">{passage.text}</p>
                <p className="mt-2">
                  <a
                    href={`/knowledge#${slugId(passage.chunkId)}`}
                    className="mono"
                  >
                    {passage.chunkId}
                  </a>
                </p>
              </blockquote>
            ) : null}
          </Panel>

          <Panel title="The challenge" className="panel-challenge">
            {skipped ? (
              <p className="body">
                The critic was not called. {criticSkipWhy(record)}
              </p>
            ) : abandoned ? (
              <p className="body">
                The critic was started but did not finish. {abandoned.detail}.
              </p>
            ) : output.alternative_hypotheses.length === 0 ? (
              <p className="body text-mute">
                No alternative was proposed.
              </p>
            ) : (
              <ul className="stack">
                {output.alternative_hypotheses.map((h, i) => (
                  <li
                    key={i}
                    className="border-t border-rule pt-3 first:border-0 first:pt-0"
                  >
                    <p className="mb-2">
                      <AltStatusMark status={h.status} />
                      <span className="dense text-graphite ml-2">
                        {altOutcomeCopy(h.status)}
                      </span>
                    </p>
                    <Prose
                      text={h.statement}
                      findings={findings}
                      hotCall={selectedCallId}
                      onCall={selectCall}
                    />
                    <div className="mt-3 border border-rule rounded p-3">
                      <p className="label mb-1">Falsifying test</p>
                      <p className="dense">
                        <FindingText
                          text={h.falsifying_test}
                          findings={findings}
                          hotCall={selectedCallId}
                          onCall={selectCall}
                        />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {output.counter_evidence.length > 0 ? (
              <ul className="mt-4 stack" style={{ gap: 8 }}>
                {output.counter_evidence.map((e, i) => {
                  const hot =
                    e.source.kind === "tool_call" &&
                    e.source.call_id === selectedCallId;
                  return (
                    <li
                      key={i}
                      className="border-t border-rule pt-2 first:border-0 first:pt-0"
                    >
                      <Prose
                        text={e.claim}
                        findings={findings}
                        hotCall={selectedCallId}
                        onCall={selectCall}
                      />
                      <div className="mt-1">
                        {sourceChip(e.source, hot, selectCall)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : skipped || abandoned ? null : (
              <p className="dense text-mute mt-3">No counter-evidence recorded.</p>
            )}
          </Panel>

          <Panel title="Limits">
            <p className="label mb-2">How much to trust this</p>
            {ceiling ? (
              <>
                <p className="body">
                  {output.confidence.model_requested} was refused:{" "}
                  {ceilingCopy(ceiling)}. Code granted {granted ?? "—"}.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-6">
                  <div>
                    <p className="label">Asked for</p>
                    <p className="figure text-critical line-through decoration-critical">
                      {output.confidence.model_requested}
                    </p>
                  </div>
                  <p className="label pb-1" aria-hidden>
                    →
                  </p>
                  <div>
                    <p className="label">Granted</p>
                    {granted ? (
                      <p className="mt-1">
                        <BandMark band={granted} />
                      </p>
                    ) : (
                      <p className="figure">—</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="body">
                {granted ? (
                  <>
                    Granted {granted}.{" "}
                    {evidenceTypeCopy(output.leading_hypothesis.evidence_type)}.
                  </>
                ) : (
                  "No confidence band was granted."
                )}
              </p>
            )}
            {!synthesized ? (
              <p className="body mt-3">
                {stopReasonCopy(record.stop_reason)}.
              </p>
            ) : null}
            {output.uncertainty.length > 0 ? (
              <>
                <p className="label mt-4 mb-2">Still unresolved</p>
                <ul className="list-disc pl-5 dense space-y-1">
                  {output.uncertainty.map((u, i) => (
                    <li key={i}>
                      <FindingText
                        text={u}
                        findings={findings}
                        hotCall={selectedCallId}
                        onCall={selectCall}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Panel>

          <Panel
            title="Next"
            meta={
              output.recommended_actions.length > 0
                ? String(output.recommended_actions.length)
                : undefined
            }
          >
            {output.recommended_actions.length === 0 ? (
              <p className="dense text-mute">No next steps were recorded.</p>
            ) : (
              <ul>
                {output.recommended_actions.map((a) => (
                  <li
                    key={a.action_id}
                    className="border-t border-rule py-3 first:border-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <span className="mono text-mute">{a.action_id}</span>
                      <span className="dense">{riskClassCopy(a.risk_class)}</span>
                      {needsSignOff(a.risk_class) ? (
                        <span className="chip chip-critical">needs sign-off</span>
                      ) : null}
                    </div>
                    <p className="body">
                      <FindingText
                        text={a.description}
                        findings={findings}
                        hotCall={selectedCallId}
                        onCall={selectCall}
                      />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <details className="panel">
            <summary className="cursor-pointer">
              <span className="label">Receipts</span>
              <span className="mono text-mute ml-3">
                {findings.length} findings · {output.knowledge_sources.length}{" "}
                chunks
              </span>
            </summary>
            <div className="stack mt-3">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="label">
                    <th className="py-1 pr-2 font-normal">id</th>
                    <th className="py-1 pr-2 font-normal">what</th>
                    <th className="py-1 pr-2 font-normal text-right">value</th>
                    <th className="py-1 pr-2 font-normal">unit</th>
                    <th className="py-1 font-normal">source</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f) => {
                    const callId =
                      f.source.kind === "tool_call" ? f.source.call_id : null;
                    const hot = callId !== null && callId === selectedCallId;
                    return (
                      <tr
                        key={f.id}
                        className={`border-t border-rule ${hot ? "cell-elevated" : ""} ${callId ? "cursor-pointer" : ""}`}
                        onClick={
                          callId ? () => selectCall(callId) : undefined
                        }
                      >
                        <td className="py-1 pr-2 mono">{f.id}</td>
                        <td className="py-1 pr-2 dense">{f.label}</td>
                        <td className="py-1 pr-2 mono text-right tabular-nums">
                          {formatNumber(f.value)}
                        </td>
                        <td className="py-1 pr-2 mono text-mute">{f.unit}</td>
                        <td className="py-1">
                          {sourceChip(f.source, hot, selectCall)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {output.knowledge_sources.length === 0 ? (
                <p className="dense text-mute">No chunks retrieved.</p>
              ) : (
                <ul>
                  {output.knowledge_sources.map((k) => {
                    const chunk = byChunk.get(k.chunk_id);
                    return (
                      <li
                        key={k.chunk_id}
                        id={slugId(k.chunk_id)}
                        className="chunk-row border-t border-rule py-2 first:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <a
                            href={`/knowledge#${slugId(k.chunk_id)}`}
                            className="mono"
                          >
                            {k.doc_id}
                          </a>
                          <span className="dense truncate">{k.section}</span>
                          <span className="ml-auto w-24">
                            <MagBar
                              value={k.score}
                              max={maxScore}
                              tone="inert"
                              label={k.score.toFixed(2)}
                            />
                          </span>
                        </div>
                        {chunk ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer mono text-mute">
                              {k.chunk_id}
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap body">
                              {chunk.text}
                            </pre>
                          </details>
                        ) : (
                          <p className="mono text-mute">{k.chunk_id}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="dense">
                Raw artefact{" "}
                <a href={`/runs/${runId}`} className="mono">
                  {runId}.json
                </a>
              </p>
            </div>
          </details>
        </div>

        <aside className="mt-3 lg:mt-0 lg:sticky lg:top-[3rem] lg:h-[calc(100vh-3.75rem)] lg:overflow-y-auto">
          <Panel title="What was checked" meta={`${toolCalls} calls`}>
            <Trace
              events={output.trace}
              selectedCallId={selectedCallId}
              onSelect={selectCall}
            />
          </Panel>
        </aside>
      </div>
    </article>
  );
}
