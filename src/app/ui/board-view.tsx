"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { InvestigationRecord } from "../../../evals/artefact";
import type { Ticket, TicketPriority, TicketQueue, TicketStatus } from "@/lib/schema/ticket";
import { QUEUE_IDS, TICKET_PRIORITIES } from "@/lib/schema/ticket";
import { boardNow } from "@/lib/routing/clock";
import { loadRoster } from "@/lib/routing/fixtures";
import { mergeTickets } from "@/lib/routing/route";
import type { Chunk } from "@/lib/retrieval/types";
import {
  BOARD_COLUMNS,
  COLUMN_EMPTY,
  DEFAULT_FILTERS,
  QUEUE_LABEL,
  RAIL_EMPTY,
  RAIL_LABEL,
  STATUS_LABEL,
  applyDrop,
  applyTicketChange,
  boardStats,
  bulkApply,
  columnCount,
  createManualTicket,
  filterTickets,
  isDropEnabled,
  layoutBoard,
  parseDropId,
  sortBoardCards,
  sparseColumnHint,
  swimlaneCapacity,
  visibleBoardColumns,
  type BoardFilters,
  type DropTarget,
} from "@/lib/tickets";
import { loadTickets, saveTickets, upsertTicket } from "@/lib/tickets/storage";
import { MagBar } from "./bars";
import { TicketCard, TicketCardFace } from "./ticket-card";
import { TicketDrawer } from "./ticket-drawer";

function DropZone({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${disabled ? "drop-disabled" : ""} ${isOver && !disabled ? "drop-over" : ""}`}
    >
      {children}
    </div>
  );
}

export function BoardView({
  runId,
  runTimestamp,
  committedTickets,
  records,
  chunks,
}: {
  runId: string;
  runTimestamp: string;
  committedTickets: Ticket[];
  records: InvestigationRecord[];
  chunks: Chunk[];
}) {
  const roster = useMemo(() => loadRoster(), []);
  const chunkMap = useMemo(
    () => new Map(chunks.map((c) => [c.chunk_id, c])),
    [chunks],
  );
  const byInvestigation = useMemo(() => {
    const m = new Map<string, InvestigationRecord>();
    for (const row of records) m.set(row.output.investigation_id, row);
    return m;
  }, [records]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<TicketQueue>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<TicketStatus>("IN_PROGRESS");
  const [manualTitle, setManualTitle] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [manualQueue, setManualQueue] = useState<TicketQueue | "">("");
  const [manualAssignee, setManualAssignee] = useState("");
  const [manualPriority, setManualPriority] = useState<TicketPriority>("MEDIUM");
  const [manualError, setManualError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"status" | "priority" | "assignee">(
    "status",
  );
  const [lastUndo, setLastUndo] = useState<{
    ticketId: string;
    status: TicketStatus;
    assignee: string | null;
    queue: TicketQueue | null;
    priority: TicketPriority;
  } | null>(null);

  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("ticket");

  const now = boardNow({ mode: "replay", runTimestamp });

  useEffect(() => {
    setTickets(mergeTickets(loadTickets(runId), committedTickets));
  }, [runId, committedTickets]);

  const persistOne = useCallback(
    (ticket: Ticket, previous?: Ticket) => {
      if (previous) {
        setLastUndo({
          ticketId: previous.ticket_id,
          status: previous.status,
          assignee: previous.assignee,
          queue: previous.queue,
          priority: previous.priority,
        });
      }
      const next = mergeTickets(upsertTicket(runId, ticket), committedTickets);
      setTickets(next);
    },
    [runId, committedTickets],
  );

  const persistAll = useCallback(
    (next: Ticket[]) => {
      saveTickets(runId, next);
      setTickets(mergeTickets(next, committedTickets));
    },
    [runId, committedTickets],
  );

  const visible = useMemo(
    () => filterTickets(tickets, filters),
    [tickets, filters],
  );
  const layout = useMemo(() => layoutBoard(visible), [visible]);
  const columns = useMemo(() => visibleBoardColumns(layout), [layout]);
  const sparse = useMemo(() => sparseColumnHint(visible), [visible]);
  const stats = useMemo(() => boardStats(tickets), [tickets]);
  const activeTicket = tickets.find((t) => t.ticket_id === activeId) ?? null;
  const openTicket = tickets.find((t) => t.ticket_id === openId) ?? null;
  const openRecord =
    openTicket && openTicket.source !== "manual"
      ? (byInvestigation.get(openTicket.source.investigation_id) ?? null)
      : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function openDrawer(id: string) {
    router.replace(`/board?ticket=${id}`, { scroll: false });
  }
  function closeDrawer() {
    router.replace("/board", { scroll: false });
  }

  function dropEnabled(target: DropTarget): boolean {
    if (!activeTicket) return true;
    return isDropEnabled(activeTicket, target);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const fromId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveId(null);
    if (!overId) return;
    const ticket = tickets.find((t) => t.ticket_id === fromId);
    const target = parseDropId(overId);
    if (!ticket || !target) return;
    const result = applyDrop({
      ticket,
      target,
      actor: "operator",
      now,
    });
    if (result.ok) persistOne(result.ticket, ticket);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    const result = bulkApply({
      tickets,
      ids: [...selected],
      patch: { status: bulkStatus },
      actor: "operator",
      now,
    });
    persistAll(result.tickets);
    setSelected(new Set());
    setLastUndo(null);
  }

  function undoLast() {
    if (!lastUndo) return;
    const current = tickets.find((t) => t.ticket_id === lastUndo.ticketId);
    if (!current) return;
    const result = applyTicketChange({
      ticket: current,
      patch: {
        status: lastUndo.status,
        assignee: lastUndo.assignee,
        queue: lastUndo.queue,
        priority: lastUndo.priority,
      },
      actor: "operator",
      now,
    });
    if (!result.ok) return;
    const next = mergeTickets(upsertTicket(runId, result.ticket), committedTickets);
    setTickets(next);
    setLastUndo(null);
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const created = createManualTicket({
      title: manualTitle,
      body: manualBody,
      queue: manualQueue === "" ? null : manualQueue,
      assignee: manualAssignee === "" ? null : manualAssignee,
      priority: manualPriority,
      existing: tickets,
      now,
    });
    if (!created.ok || !created.ticket) {
      setManualError(created.reason);
      return;
    }
    persistOne(created.ticket);
    setManualTitle("");
    setManualBody("");
    setManualError(null);
    openDrawer(created.ticket.ticket_id);
  }

  function handlePatch(patch: {
    status?: TicketStatus;
    assignee?: string | null;
    queue?: TicketQueue | null;
    note?: string;
  }): string | null {
    if (!openTicket) return "no ticket";
    const nextPatch = { ...patch };
    if (
      nextPatch.assignee &&
      (openTicket.status === "TRIAGE" || openTicket.status === "BACKLOG") &&
      nextPatch.status === undefined
    ) {
      nextPatch.status = "TODO";
    }
    const result = applyTicketChange({
      ticket: openTicket,
      patch: nextPatch,
      actor: "operator",
      now,
    });
    if (!result.ok) return result.reason;
    persistOne(result.ticket, openTicket);
    return null;
  }

  function toggleLane(queue: TicketQueue) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(queue)) next.delete(queue);
      else next.add(queue);
      return next;
    });
  }

  return (
    <div>
      <h1 className="display">Board</h1>
      <p className="label mt-1">
        {stats.open} open · {stats.fromInvestigation} from investigation ·{" "}
        {stats.manual} manual · tickets persist in this browser, keyed by this
        run
      </p>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 dense">
        {(["TRIAGE", "BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"] as TicketStatus[]).map(
          (s) => (
            <div key={s}>
              <dt className="label">{STATUS_LABEL[s]}</dt>
              <dd className="m-0 mono">{stats.byStatus[s]}</dd>
            </div>
          ),
        )}
        {QUEUE_IDS.map((q) => (
          <div key={q}>
            <dt className="label">{QUEUE_LABEL[q]}</dt>
            <dd className="m-0 mono">{stats.byQueue[q]}</dd>
          </div>
        ))}
      </dl>

      {sparse && groupBy === "status" ? (
        <p className="dense mt-3 text-secondary" data-testid="sparse-hint">
          {Math.round(sparse.share * 100)}% of visible tickets are in{" "}
          {STATUS_LABEL[sparse.status]}. Regroup by{" "}
          <button
            type="button"
            className="btn-approve"
            onClick={() => setGroupBy("priority")}
          >
            priority
          </button>{" "}
          or{" "}
          <button
            type="button"
            className="btn-approve"
            onClick={() => setGroupBy("assignee")}
          >
            assignee
          </button>
          .
        </p>
      ) : null}
      {groupBy !== "status" ? (
        <p className="dense mt-3">
          Grouped by {groupBy}.{" "}
          <button
            type="button"
            className="btn-approve"
            onClick={() => setGroupBy("status")}
          >
            Status board
          </button>
        </p>
      ) : null}
      {lastUndo ? (
        <p className="dense mt-2">
          <button type="button" className="btn-approve" onClick={undoLast}>
            Undo
          </button>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 dense">
        <label>
          Queue{" "}
          <select
            value={filters.queue}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                queue: e.target.value as BoardFilters["queue"],
              }))
            }
          >
            <option value="all">all</option>
            <option value="none">unset</option>
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
            value={filters.assignee}
            onChange={(e) =>
              setFilters((f) => ({ ...f, assignee: e.target.value }))
            }
          >
            <option value="all">all</option>
            <option value="unassigned">unassigned</option>
            {roster.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority{" "}
          <select
            value={filters.priority}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                priority: e.target.value as BoardFilters["priority"],
              }))
            }
          >
            <option value="all">all</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          Source{" "}
          <select
            value={filters.source}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                source: e.target.value as BoardFilters["source"],
              }))
            }
          >
            <option value="all">all</option>
            <option value="investigation">investigation</option>
            <option value="manual">manual</option>
          </select>
        </label>
        <label>
          Status{" "}
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as BoardFilters["status"],
              }))
            }
          >
            <option value="all">all</option>
            <option value="TRIAGE">Triage</option>
            <option value="BACKLOG">Backlog</option>
            {BOARD_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected.size > 0 ? (
        <p className="mt-3 dense">
          {selected.size} selected{" "}
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as TicketStatus)}
          >
            {BOARD_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>{" "}
          <button type="button" className="btn-approve" onClick={applyBulk}>
            Apply
          </button>
        </p>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer dense">Create ticket</summary>
        <form className="mt-2 grid gap-2 max-w-md" onSubmit={submitManual}>
          <input
            className="border border-rule px-2 py-1 body"
            placeholder="Title"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            required
          />
          <textarea
            className="border border-rule px-2 py-1 body"
            placeholder="Body"
            value={manualBody}
            onChange={(e) => setManualBody(e.target.value)}
            rows={3}
          />
          <label className="dense">
            Queue{" "}
            <select
              value={manualQueue}
              onChange={(e) =>
                setManualQueue(e.target.value as TicketQueue | "")
              }
            >
              <option value="">unset (triage)</option>
              {QUEUE_IDS.map((q) => (
                <option key={q} value={q}>
                  {QUEUE_LABEL[q]}
                </option>
              ))}
            </select>
          </label>
          <label className="dense">
            Assignee{" "}
            <select
              value={manualAssignee}
              onChange={(e) => setManualAssignee(e.target.value)}
            >
              <option value="">unassigned</option>
              {roster.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dense">
            Priority{" "}
            <select
              value={manualPriority}
              onChange={(e) =>
                setManualPriority(e.target.value as TicketPriority)
              }
            >
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
          {manualError ? (
            <p className="dense text-critical">{manualError}</p>
          ) : null}
          <button type="submit" className="btn-approve w-fit">
            Create
          </button>
        </form>
      </details>

      {groupBy === "priority" ? (
        <div className="board-grid mt-5">
          {TICKET_PRIORITIES.map((priority) => {
            const cards = sortBoardCards(
              visible.filter((t) => t.priority === priority),
            );
            return (
              <section key={priority} className="board-column">
                <h2 className="label m-0">{priority}</h2>
                <span className="mono text-mute">{cards.length}</span>
                <ul className="mt-2 grid gap-2">
                  {cards.map((t) => (
                    <li key={t.ticket_id}>
                      <TicketCardFace
                        ticket={t}
                        now={now}
                        onOpen={() => openDrawer(t.ticket_id)}
                        showStatusIcon
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {groupBy === "assignee" ? (
        <div className="board-grid mt-5">
          {[{ id: null, name: "Unassigned" }, ...roster.map((e) => ({ id: e.id, name: e.name }))].map(
            (eng) => {
              const cards = sortBoardCards(
                visible.filter((t) => t.assignee === eng.id),
              );
              if (cards.length === 0 && eng.id !== null) return null;
              return (
                <section key={eng.id ?? "none"} className="board-column">
                  <h2 className="label m-0">{eng.name}</h2>
                  <span className="mono text-mute">{cards.length}</span>
                  <ul className="mt-2 grid gap-2">
                    {cards.map((t) => (
                      <li key={t.ticket_id}>
                        <TicketCardFace
                          ticket={t}
                          now={now}
                          onOpen={() => openDrawer(t.ticket_id)}
                          showStatusIcon
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            },
          )}
        </div>
      ) : null}

      {groupBy === "status" ? (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <DropZone
          id="rail"
          disabled={activeTicket ? !dropEnabled({ kind: "rail" }) : false}
          className="board-rail mt-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label m-0">{RAIL_LABEL}</h2>
            <span className="mono text-mute">{layout.rail.length}</span>
          </div>
          {layout.rail.length === 0 ? (
            <p className="dense text-mute mt-2">{RAIL_EMPTY}</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {layout.rail.map((t) => (
                <li key={t.ticket_id}>
                  <TicketCard
                    ticket={t}
                    now={now}
                    selected={selected.has(t.ticket_id)}
                    onToggleSelect={() => toggleSelect(t.ticket_id)}
                    onOpen={() => openDrawer(t.ticket_id)}
                    showStatusIcon
                  />
                </li>
              ))}
            </ul>
          )}
        </DropZone>

        <div className="board-grid mt-4">
          {columns.map((status) => {
            const n = columnCount(layout, status);
            return (
              <DropZone
                key={status}
                id={`column:${status}`}
                disabled={
                  activeTicket
                    ? !dropEnabled({ kind: "column", status })
                    : false
                }
                className="board-column"
              >
                <header className="flex items-baseline justify-between gap-2 mb-2">
                  <h2 className="label m-0">{STATUS_LABEL[status]}</h2>
                  <span className="mono text-mute">{n}</span>
                </header>
                {n === 0 ? (
                  <p className="dense text-mute mb-3">{COLUMN_EMPTY[status]}</p>
                ) : null}
                {QUEUE_IDS.map((queue) => {
                  const cell = layout.columns[status][queue];
                  const cap = swimlaneCapacity(queue, tickets, roster);
                  const closed = collapsed.has(queue);
                  const engineers = roster.filter((e) => e.queue === queue);
                  return (
                    <section
                      key={queue}
                      className="board-lane border-t border-rule pt-2 mt-2"
                    >
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-2 text-left"
                        onClick={() => toggleLane(queue)}
                        aria-expanded={!closed}
                      >
                        <span className="dense font-medium">
                          {QUEUE_LABEL[queue]}
                        </span>
                        <span className="mono text-mute">
                          {cell.length}
                          {status === "TODO" ||
                          status === "IN_PROGRESS" ||
                          status === "IN_REVIEW"
                            ? ` · ${cap.used}/${cap.limit}`
                            : ""}
                          {cap.over &&
                          (status === "TODO" ||
                            status === "IN_PROGRESS" ||
                            status === "IN_REVIEW")
                            ? " over"
                            : ""}
                        </span>
                      </button>
                      {status === "TODO" ||
                      status === "IN_PROGRESS" ||
                      status === "IN_REVIEW" ? (
                        <div className="mt-1">
                          <MagBar
                            value={cap.used}
                            max={Math.max(cap.limit, cap.used, 1)}
                            tone={cap.over ? "critical" : "inert"}
                            label={`${cap.used}/${cap.limit}`}
                          />
                        </div>
                      ) : null}
                      {!closed ? (
                        <>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {engineers.map((eng) => (
                              <DropZone
                                key={eng.id}
                                id={`person:${eng.id}:${status}:${queue}`}
                                disabled={
                                  activeTicket
                                    ? !dropEnabled({
                                        kind: "person",
                                        engineerId: eng.id,
                                        status,
                                        queue,
                                      })
                                    : false
                                }
                                className="inline-block"
                              >
                                <span className="chip chip-inert">
                                  {eng.name.split(" ")[0]}
                                </span>
                              </DropZone>
                            ))}
                          </div>
                          <DropZone
                            id={`cell:${status}:${queue}`}
                            disabled={
                              activeTicket
                                ? !dropEnabled({
                                    kind: "cell",
                                    status,
                                    queue,
                                  })
                                : false
                            }
                            className="mt-2 min-h-[4.5rem]"
                          >
                            {cell.length === 0 ? (
                              <div className="board-cell-slot" />
                            ) : (
                              <ul className="grid gap-2">
                                {cell.map((t) => (
                                  <li key={t.ticket_id}>
                                    <TicketCard
                                      ticket={t}
                                      now={now}
                                      selected={selected.has(t.ticket_id)}
                                      onToggleSelect={() =>
                                        toggleSelect(t.ticket_id)
                                      }
                                      onOpen={() => openDrawer(t.ticket_id)}
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </DropZone>
                        </>
                      ) : null}
                    </section>
                  );
                })}
              </DropZone>
            );
          })}
        </div>

        <DragOverlay>
          {activeTicket ? (
            <TicketCardFace ticket={activeTicket} now={now} />
          ) : null}
        </DragOverlay>
      </DndContext>
      ) : null}

      {openTicket ? (
        <TicketDrawer
          ticket={openTicket}
          record={openRecord}
          chunks={chunkMap}
          roster={roster}
          nowLabel="ticket clock is the run timestamp"
          onClose={closeDrawer}
          onPatch={handlePatch}
        />
      ) : null}
    </div>
  );
}
