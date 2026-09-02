"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { InvestigationRecord } from "../../../evals/artefact";
import type { Ticket } from "@/lib/schema/ticket";
import { QUEUE_IDS } from "@/lib/schema/ticket";
import { engineerById, type EngineerRecord } from "@/lib/routing/fixtures";
import type { Chunk } from "@/lib/retrieval/types";
import { formatTimestamp } from "@/lib/replay/format";
import { firstLine } from "@/lib/replay/copy";
import { BandMark, StatusMark } from "./status-mark";
import { QUEUE_LABEL, STATUS_LABEL } from "@/lib/tickets/labels";
import { PriorityGlyph, StatusIcon } from "./ticket-marks";
import {
  inheritedKnowledge,
  sourceActionId,
  sourceCandidateId,
  splitRoutingRationale,
} from "@/lib/tickets/provenance";

export function TicketDrawer({
  ticket,
  record,
  chunks,
  roster,
  nowLabel,
  onClose,
  onPatch,
}: {
  ticket: Ticket;
  record: InvestigationRecord | null;
  chunks: ReadonlyMap<string, Chunk>;
  roster: readonly EngineerRecord[];
  nowLabel: string;
  onClose: () => void;
  onPatch: (patch: {
    status?: Ticket["status"];
    assignee?: string | null;
    queue?: Ticket["queue"];
    note?: string;
  }) => string | null;
}) {
  const engineer = ticket.assignee ? engineerById(ticket.assignee, roster) : null;
  const split = splitRoutingRationale(ticket, roster);
  const output = record?.output ?? null;
  const actionId = sourceActionId(ticket);
  const action = output?.recommended_actions.find((a) => a.action_id === actionId);
  const candidateId = sourceCandidateId(ticket);
  const grounding = inheritedKnowledge(ticket, output, chunks);
  const ceiling = output?.confidence.ceiling_rule_applied ?? null;
  const [note, setNote] = useState("");
  const [patchError, setPatchError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ticket-drawer-root">
      <button
        type="button"
        className="ticket-drawer-mask"
        aria-label="Close ticket"
        onClick={onClose}
      />
      <aside className="ticket-drawer" role="dialog" aria-labelledby="drawer-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono text-tertiary flex items-center gap-1">
              <StatusIcon status={ticket.status} />
              {ticket.ticket_id}
            </p>
            <h2 id="drawer-title" className="body font-ui mt-1">
              {ticket.title}
            </h2>
          </div>
          <button type="button" className="btn-approve" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="dense text-mute mt-2">
          Tickets persist in this browser, keyed by this run. {nowLabel}.
        </p>

        <section className="mt-5">
          <h3 className="label">The ticket</h3>
          <p className="body mt-2 prose-measure">{ticket.body}</p>
          <dl className="mt-3 grid gap-2 dense">
            <div>
              <dt className="label">Queue</dt>
              <dd className="m-0">
                {ticket.queue ? QUEUE_LABEL[ticket.queue] : "unset"}
              </dd>
            </div>
            <div>
              <dt className="label">Assignee</dt>
              <dd className="m-0">{engineer ? engineer.name : "unassigned"}</dd>
            </div>
            <div>
              <dt className="label">Priority</dt>
              <dd className="m-0 flex items-center gap-1">
                <PriorityGlyph priority={ticket.priority} />
                <span>{ticket.priority}</span>
              </dd>
            </div>
            <div>
              <dt className="label">Due</dt>
              <dd className="m-0 mono">{formatTimestamp(ticket.due_at)}</dd>
            </div>
            <div>
              <dt className="label">Status</dt>
              <dd className="m-0">{STATUS_LABEL[ticket.status]}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 dense">
            <label>
              Status{" "}
              <select
                value={ticket.status}
                onChange={(e) =>
                  setPatchError(
                    onPatch({ status: e.target.value as Ticket["status"] }),
                  )
                }
              >
                <option value="TRIAGE">{STATUS_LABEL.TRIAGE}</option>
                <option value="BACKLOG">{STATUS_LABEL.BACKLOG}</option>
                <option value="TODO">{STATUS_LABEL.TODO}</option>
                <option value="IN_PROGRESS">{STATUS_LABEL.IN_PROGRESS}</option>
                <option value="IN_REVIEW">{STATUS_LABEL.IN_REVIEW}</option>
                <option value="BLOCKED">{STATUS_LABEL.BLOCKED}</option>
                <option value="DONE">{STATUS_LABEL.DONE}</option>
                <option value="CANCELLED">{STATUS_LABEL.CANCELLED}</option>
              </select>
            </label>
            <label>
              Queue{" "}
              <select
                value={ticket.queue ?? ""}
                onChange={(e) =>
                  setPatchError(
                    onPatch({
                      queue:
                        e.target.value === ""
                          ? null
                          : (e.target.value as Ticket["queue"]),
                    }),
                  )
                }
              >
                <option value="">unset</option>
                {QUEUE_IDS.map((q) => (
                  <option key={q} value={q}>
                    {QUEUE_LABEL[q]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee{" "}
              <select
                value={ticket.assignee ?? ""}
                onChange={(e) =>
                  setPatchError(
                    onPatch({
                      assignee: e.target.value === "" ? null : e.target.value,
                    }),
                  )
                }
              >
                <option value="">unassigned</option>
                {roster.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {patchError ? (
            <p className="dense text-critical mt-2">{patchError}</p>
          ) : null}
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const err = onPatch({ note });
              setPatchError(err);
              if (!err) setNote("");
            }}
          >
            <label className="label" htmlFor="ticket-note">
              Note
            </label>
            <textarea
              id="ticket-note"
              className="mt-1 w-full border border-rule px-2 py-1 body"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="btn-approve mt-2">
              Add note
            </button>
          </form>
        </section>

        <section className="mt-5">
          <h3 className="label">Why this engineer</h3>
          <div className="mt-3 border border-rule rounded p-3">
            <p className="label">Assessor — the skills, in its words</p>
            {split.assessor.skills.length > 0 ? (
              <p className="mt-2 flex flex-wrap gap-1">
                {split.assessor.skills.map((s) => (
                  <span key={s} className="chip chip-inert">
                    {s}
                  </span>
                ))}
              </p>
            ) : (
              <p className="dense text-mute mt-2">No skills named.</p>
            )}
            <p className="body mt-2 prose-measure">{split.assessor.words}</p>
          </div>
          <div className="mt-2 border border-rule rounded p-3">
            <p className="label">Code — overlap, capacity, tie-break</p>
            <p className="dense mt-2">
              overlap {split.code.overlapCount}
              {split.code.overlapSkills.length > 0
                ? ` (${split.code.overlapSkills.join(", ")})`
                : ""}
            </p>
            <p className="dense">{split.code.wipCheck}</p>
            <p className="dense">{split.code.tieBreak}</p>
            {split.code.words ? (
              <p className="dense text-mute mt-2">{split.code.words}</p>
            ) : null}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="label">Where this came from</h3>
          {ticket.source === "manual" || !output ? (
            <p className="dense text-mute mt-2">
              Manual ticket. No source investigation.
            </p>
          ) : (
            <>
              <p className="mt-2">
                <StatusMark status={output.status} />
                {output.confidence.granted ? (
                  <span className="ml-2">
                    <BandMark band={output.confidence.granted} />
                  </span>
                ) : null}
              </p>
              {ceiling ? (
                <p className="dense mt-2">
                  Asked {output.confidence.model_requested}; code granted{" "}
                  {output.confidence.granted ?? "—"}. Ceiling: {ceiling}.
                </p>
              ) : (
                <p className="dense mt-2">
                  Granted {output.confidence.granted ?? "—"}. No ceiling
                  override.
                </p>
              )}
              <p className="body mt-2 prose-measure">
                {output.leading_hypothesis.statement}
              </p>
              {action ? (
                <p className="dense mt-2 prose-measure">{action.description}</p>
              ) : null}
              {candidateId ? (
                <p className="dense mt-2">
                  <Link href={`/investigate/${candidateId}`}>Full record</Link>
                </p>
              ) : null}
            </>
          )}
        </section>

        {grounding.length > 0 ? (
          <section className="mt-5">
            <h3 className="label">Inherited grounding</h3>
            <p className="dense text-mute mt-1">
              The ticket retrieved nothing. These chunks were cited on the
              source investigation.
            </p>
            <ul className="mt-2">
              {grounding.map((k) => {
                const lines = k.text ? firstLine(k.text) : null;
                return (
                  <li key={k.chunk_id} className="border-t border-rule py-2">
                    <p className="mono">
                      {k.doc_id}
                      <span className="dense text-graphite ml-2">
                        {k.section}
                      </span>
                      <span className="mono text-mute ml-2">
                        {k.score.toFixed(2)}
                      </span>
                    </p>
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
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {ticket.notes.length > 0 ? (
          <section className="mt-5">
            <h3 className="label">Notes</h3>
            <ul className="mt-2">
              {ticket.notes.map((n, i) => (
                <li key={i} className="border-t border-rule py-2">
                  <p className="mono text-mute">
                    {n.author} · {formatTimestamp(n.at)}
                  </p>
                  <p className="body mt-1">{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-5">
          <h3 className="label">Activity</h3>
          <ol className="mt-2 list-none p-0 m-0">
            {ticket.activity.map((a, i) => (
              <li key={i} className="border-t border-rule py-2 dense">
                <span className="mono">{a.kind}</span>
                {a.from || a.to ? (
                  <span className="ml-2">
                    {a.from ?? "—"} → {a.to ?? "—"}
                  </span>
                ) : null}
                <span className="mono text-mute ml-2">
                  {a.actor} · {formatTimestamp(a.at)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
