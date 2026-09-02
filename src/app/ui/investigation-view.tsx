"use client";

import { useEffect, useState } from "react";
import type { InvestigationRecord } from "../../../evals/artefact";
import type { Chunk } from "@/lib/retrieval/types";
import type {
  DeterministicFinding,
  EvidenceItem,
  InvestigationOutput,
  RecommendedAction,
} from "@/lib/schema/investigation";
import type { Ticket } from "@/lib/schema/ticket";
import type { Provenance } from "@/lib/schema/quantity";
import type { TriageCandidate } from "@/lib/triage/types";
import {
  execute,
  requiresApproval,
  type ApprovalRecord,
  type ExecutionRecord,
} from "@/lib/approval";
import { createTicketAfterApproval } from "@/lib/routing/create";
import { existingForAction, mergeTickets } from "@/lib/routing/route";
import { loadTickets, upsertTicket } from "@/lib/tickets/storage";
import {
  carryFindings,
  ceilingCopy,
  challengeResolution,
  dismissalNote,
  evidenceTypeCopy,
  firstLine,
  formatMultiplier,
  headlineComparison,
  leadPoint,
  riskClassCopy,
  splitFirstSentence,
  statusToneClass,
  stopReasonCopy,
} from "@/lib/replay/copy";
import { formatNumber, formatQuantity, formatTimestamp, slugId } from "@/lib/replay/format";
import { FindingText } from "./finding-text";
import { Panel } from "./panel";
import { BandMark, AltStatusMark } from "./status-mark";
import { TicketInline } from "./ticket-inline";
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
    <p className={`body prose-measure ${quiet ? "text-mute" : ""}`}>
      <FindingText
        text={text}
        findings={findings}
        hotCall={hotCall}
        onCall={onCall}
      />
    </p>
  );
}

function ClaimBody({
  lead,
  rest,
  findings,
  hotCall,
  onCall,
}: {
  lead: string;
  rest: string;
  findings: readonly DeterministicFinding[];
  hotCall: string | null;
  onCall: (id: string) => void;
}) {
  const leadNode = (
    <FindingText
      text={lead}
      findings={findings}
      hotCall={hotCall}
      onCall={onCall}
    />
  );
  if (!rest) {
    return <p className="body prose-measure m-0">{leadNode}</p>;
  }
  return (
    <details className="prose-measure">
      <summary className="body cursor-pointer">{leadNode}</summary>
      <p className="body text-graphite mt-2">
        <FindingText
          text={rest}
          findings={findings}
          hotCall={hotCall}
          onCall={onCall}
        />
      </p>
    </details>
  );
}

function NumberedClaims({
  items,
  findings,
  hotCall,
  onCall,
}: {
  items: readonly EvidenceItem[];
  findings: readonly DeterministicFinding[];
  hotCall: string | null;
  onCall: (id: string) => void;
}) {
  return (
    <ol className="list-none p-0 m-0">
      {items.map((e, i) => {
        const hot =
          e.source.kind === "tool_call" && e.source.call_id === hotCall;
        const { lead, rest } = splitFirstSentence(e.claim);
        return (
          <li
            key={i}
            className="flex gap-3 border-t border-rule py-3 first:border-0 first:pt-0"
          >
            <span className="mono text-mute w-4 shrink-0 pt-0.5">{i + 1}</span>
            <div className="min-w-0 flex-1 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <ClaimBody
                  lead={lead}
                  rest={rest}
                  findings={findings}
                  hotCall={hotCall}
                  onCall={onCall}
                />
              </div>
              <div className="shrink-0 ml-auto">
                {sourceChip(e.source, hot, onCall)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function subjectOf(c: TriageCandidate): string {
  if (c.kind === "firmware") return `firmware ${c.firmware_version ?? ""}`;
  return c.tag ?? c.id;
}

function supportingPassage(
  output: InvestigationOutput,
  byChunk: Map<string, Chunk>,
): {
  chunkId: string;
  docId: string;
  section: string;
  lead: string;
  rest: string;
} | null {
  const fromSupport = output.supporting_evidence.find(
    (e) => e.source.kind === "knowledge",
  );
  const chunkId =
    fromSupport && fromSupport.source.kind === "knowledge"
      ? fromSupport.source.chunk_id
      : output.knowledge_sources[0]?.chunk_id;
  if (!chunkId) return null;
  const chunk = byChunk.get(chunkId);
  const meta = output.knowledge_sources.find((k) => k.chunk_id === chunkId);
  const fallbackClaim =
    fromSupport && fromSupport.source.kind === "knowledge"
      ? fromSupport.claim
      : null;
  const text = chunk?.text ?? fallbackClaim;
  if (!text) return null;
  const { lead, rest } = firstLine(text);
  return {
    chunkId,
    docId: meta?.doc_id ?? chunk?.doc_id ?? "",
    section: meta?.section ?? chunk?.section ?? "",
    lead,
    rest,
  };
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
  runTimestamp,
  committedTickets,
}: {
  record: InvestigationRecord;
  candidate: TriageCandidate;
  chunks: Chunk[];
  runId: string;
  runTimestamp: string;
  committedTickets: Ticket[];
}) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showAllUnresolved, setShowAllUnresolved] = useState(false);
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
  const resolution = challengeResolution(output.alternative_hypotheses);
  const howItEnded = synthesized
    ? `Completed · ${toolCalls} calls · ${Math.round(record.metrics.wall_clock_ms / 1000)}s`
    : `${stopReasonCopy(record.stop_reason)} · ${toolCalls} calls · ${Math.round(record.metrics.wall_clock_ms / 1000)}s`;
  const verdictLine = synthesized
    ? output.title
    : stopReasonCopy(record.stop_reason);
  const unresolved = output.uncertainty.map(leadPoint);
  const unresolvedVisible = showAllUnresolved
    ? unresolved
    : unresolved.slice(0, 3);

  function selectCall(id: string) {
    setSelectedCallId(id);
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }

  useEffect(() => {
    setTickets(mergeTickets(loadTickets(runId), committedTickets));
  }, [runId, committedTickets]);

  async function approve(action: RecommendedAction) {
    if (executions.some((e) => e.action_id === action.action_id)) return;
    const current = mergeTickets(loadTickets(runId), committedTickets);
    if (
      existingForAction(current, output.investigation_id, action.action_id)
    ) {
      setTickets(current);
      return;
    }
    const at = runTimestamp;
    const nextApprovals = [...approvals, { action_id: action.action_id, at }];
    const result = execute(action, { approvals: nextApprovals, at });
    if (!result.ok) return;
    setPendingAction(action.action_id);
    try {
      const ticket = await createTicketAfterApproval({
        action,
        output,
        candidateId: candidate.id,
        runId,
        runTimestamp,
        mode: "replay",
        existing: current,
        committed: committedTickets,
      });
      const nextTickets = mergeTickets(upsertTicket(runId, ticket), committedTickets);
      setApprovals(nextApprovals);
      setExecutions((rows) => [...rows, result.record]);
      setTickets(nextTickets);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <article>
      <section className="panel mb-6 px-5 py-5">
        <p className="label mb-2">What we concluded</p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className={`verdict-status m-0 ${statusToneClass(output.status)}`}>
            {output.status}
          </h1>
          {dismissalNote(output.status) ? (
            <span className="dense text-settled">
              {dismissalNote(output.status)}
            </span>
          ) : null}
        </div>
        <p className={`mt-3 prose-measure ${synthesized ? "body" : "body text-mute"}`}>
          {verdictLine}
        </p>
        {pair ? (
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="figure">{formatNumber(pair.left.value)}</p>
              <p className="dense text-graphite mt-1">{pair.left.label}</p>
            </div>
            <p className="label pb-1 text-mute">vs</p>
            <div>
              <p className="figure">{formatNumber(pair.right.value)}</p>
              <p className="dense text-graphite mt-1">{pair.right.label}</p>
            </div>
            <p className="figure pb-0.5">{formatMultiplier(pair.ratio)}</p>
            <p className="mono text-mute pb-1">{pair.left.unit}</p>
          </div>
        ) : null}
        <dl className="mt-3 pt-3 border-t border-rule flex flex-wrap gap-x-6 gap-y-2 dense">
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

      <div className="min-[1280px]:grid min-[1280px]:grid-cols-[minmax(0,1.63fr)_minmax(0,1fr)] min-[1280px]:items-start min-[1280px]:gap-6">
        <div className="stack-sections">
          <Panel title="Why we think so">
            <p className="mb-3">
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
              <ul className="mt-3 grid gap-3 sm:grid-cols-3">
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
            {output.supporting_evidence.length > 0 ? (
              <div className="mt-3">
                <NumberedClaims
                  items={output.supporting_evidence}
                  findings={findings}
                  hotCall={selectedCallId}
                  onCall={selectCall}
                />
              </div>
            ) : null}
            {passage ? (
              <blockquote className="mt-3 border-l-2 border-ink bg-paper px-3 py-2 m-0 prose-measure">
                <p className="mono text-mute">
                  <a href={`/knowledge#${slugId(passage.chunkId)}`}>
                    {passage.docId}
                  </a>
                  {passage.section ? (
                    <span className="dense text-graphite ml-2">
                      {passage.section}
                    </span>
                  ) : null}
                </p>
                {passage.rest ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer dense">
                      {passage.lead}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap body">
                      {passage.rest}
                    </pre>
                  </details>
                ) : (
                  <p className="dense mt-1">{passage.lead}</p>
                )}
              </blockquote>
            ) : null}
          </Panel>

          <Panel title="What argues against it" className="panel-challenge">
            {skipped ? (
              <p className="body prose-measure">
                The critic was not called. {criticSkipWhy(record)}
              </p>
            ) : abandoned ? (
              <p className="body prose-measure">
                The critic was started but did not finish. {abandoned.detail}.
              </p>
            ) : output.alternative_hypotheses.length === 0 ? (
              <p className="body text-mute prose-measure">
                No alternative was proposed.
              </p>
            ) : (
              <>
                {resolution ? (
                  <p className="body prose-measure font-medium mb-3">
                    {resolution}
                  </p>
                ) : null}
                <ul className="stack">
                  {output.alternative_hypotheses.map((h, i) => (
                    <li
                      key={i}
                      className="border-t border-rule pt-3 first:border-0 first:pt-0"
                    >
                      <p className="mb-2">
                        <AltStatusMark status={h.status} />
                      </p>
                      <Prose
                        text={h.statement}
                        findings={findings}
                        hotCall={selectedCallId}
                        onCall={selectCall}
                      />
                      <div className="mt-3 border border-rule rounded p-3">
                        <p className="label mb-1">How we tested it</p>
                        <p className="dense prose-measure">
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
              </>
            )}
            {output.counter_evidence.length > 0 ? (
              <div className="mt-3">
                <NumberedClaims
                  items={output.counter_evidence}
                  findings={findings}
                  hotCall={selectedCallId}
                  onCall={selectCall}
                />
              </div>
            ) : skipped || abandoned ? null : (
              <p className="dense text-mute mt-3">No counter-evidence recorded.</p>
            )}
          </Panel>

          <Panel title="How far to trust this">
            {ceiling ? (
              <>
                <p className="body prose-measure">
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
              <p className="body prose-measure">
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
              <p className="body prose-measure mt-3">
                {stopReasonCopy(record.stop_reason)}.
              </p>
            ) : null}
            {unresolved.length > 0 ? (
              <>
                <p className="label mt-3 mb-2">Still unresolved</p>
                <ul className="list-none p-0 m-0">
                  {unresolvedVisible.map((u, i) => (
                    <li
                      key={i}
                      className="border-t border-rule py-3 first:border-0 first:pt-0"
                    >
                      <ClaimBody
                        lead={u.lead}
                        rest={u.rest}
                        findings={findings}
                        hotCall={selectedCallId}
                        onCall={selectCall}
                      />
                    </li>
                  ))}
                </ul>
                {unresolved.length > 3 && !showAllUnresolved ? (
                  <button
                    type="button"
                    className="dense mt-1 underline"
                    onClick={() => setShowAllUnresolved(true)}
                  >
                    show all {unresolved.length}
                  </button>
                ) : null}
              </>
            ) : null}
          </Panel>

          <Panel title="What to do" meta="replay · ticket clock is the run timestamp">
            {output.recommended_actions.length === 0 ? (
              <p className="dense text-mute">No next steps were recorded.</p>
            ) : (
              <ul>
                {output.recommended_actions.map((a) => {
                  const done = executions.find((e) => e.action_id === a.action_id);
                  const ticket = existingForAction(
                    tickets,
                    output.investigation_id,
                    a.action_id,
                  );
                  const gated = requiresApproval(a.risk_class);
                  const pending = pendingAction === a.action_id;
                  return (
                    <li
                      key={a.action_id}
                      className="border-t border-rule py-3 first:border-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-baseline gap-2 mb-1">
                        <span className="mono text-mute">{a.action_id}</span>
                        <span className="dense">{riskClassCopy(a.risk_class)}</span>
                        {gated && !done && !ticket ? (
                          <span className="chip chip-critical">needs sign-off</span>
                        ) : null}
                      </div>
                      <p className="body prose-measure">
                        <FindingText
                          text={a.description}
                          findings={findings}
                          hotCall={selectedCallId}
                          onCall={selectCall}
                        />
                      </p>
                      {ticket ? (
                        <TicketInline ticket={ticket} />
                      ) : done ? (
                        <p className="dense text-settled mt-2">
                          {done.outcome}
                          <span className="mono text-mute ml-2">
                            {formatTimestamp(done.at)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-2">
                          <button
                            type="button"
                            className="btn-approve"
                            disabled={pending}
                            onClick={() => void approve(a)}
                          >
                            {pending ? "Routing…" : "Approve"}
                          </button>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <details className="panel">
            <summary className="cursor-pointer">
              <span className="label">Full record</span>
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
                    const lines = chunk ? firstLine(chunk.text) : null;
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
                        {lines ? (
                          lines.rest ? (
                            <details className="mt-1">
                              <summary className="cursor-pointer dense">
                                {lines.lead}
                              </summary>
                              <pre className="mt-2 whitespace-pre-wrap body">
                                {lines.rest}
                              </pre>
                            </details>
                          ) : (
                            <p className="dense mt-1">{lines.lead}</p>
                          )
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

        <aside className="mt-6 min-[1280px]:mt-0 min-[1280px]:sticky min-[1280px]:top-[3rem] min-[1280px]:h-[calc(100vh-3.75rem)] min-[1280px]:overflow-y-auto">
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