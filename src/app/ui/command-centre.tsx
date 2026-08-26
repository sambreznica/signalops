"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Status } from "@/lib/schema/investigation";
import type { ConsequenceClass } from "@/lib/fixtures/constants";
import type { SeverityBand, TriageCandidate } from "@/lib/triage/types";
import {
  CONSEQUENCE_WEIGHT,
  HIGH_THRESHOLD,
  MEDIUM_THRESHOLD,
} from "@/lib/triage/constants";
import { computeSeverity } from "@/lib/triage/severity";
import { formatNumber, formatTimestamp } from "@/lib/replay/format";
import {
  SEVERITY_HIST_EDGES,
  deltaTone,
  histogramBins,
} from "@/lib/replay/viz";
import { CountBar, MagBar } from "./bars";
import { Panel } from "./panel";
import { BandMark, StatusMark } from "./status-mark";

export type CommandRow = {
  candidate: TriageCandidate;
  status: Status | null;
};

const BANDS: SeverityBand[] = ["HIGH", "MEDIUM", "LOW"];
const STATUSES: Status[] = [
  "CONFIRMED",
  "UNCERTAIN",
  "INCONCLUSIVE",
  "NOT_AN_INCIDENT",
];
const CONSEQUENCES: ConsequenceClass[] = [
  "REGULATORY",
  "SAFETY_ADJACENT",
  "FUNCTIONAL",
  "COSMETIC",
];

function subject(c: TriageCandidate): string {
  if (c.kind === "firmware") return `firmware ${c.firmware_version ?? ""}`;
  return c.tag ?? c.id;
}

function consequenceTone(
  cls: ConsequenceClass,
): "critical" | "elevated" | "settled" | "inert" {
  if (cls === "REGULATORY") return "critical";
  if (cls === "SAFETY_ADJACENT") return "elevated";
  if (cls === "FUNCTIONAL") return "inert";
  return "inert";
}

function toggleIn<T extends string>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function CommandCentre({
  runId,
  model,
  timestamp,
  rows,
}: {
  runId: string;
  model: string;
  timestamp: string;
  rows: CommandRow[];
}) {
  const [bands, setBands] = useState<Set<SeverityBand>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [consequences, setConsequences] = useState<Set<ConsequenceClass>>(
    new Set(),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const filterRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(0);
  const visibleRef = useRef<CommandRow[]>([]);

  const bandCounts = Object.fromEntries(
    BANDS.map((b) => [b, rows.filter((r) => r.candidate.band === b).length]),
  ) as Record<SeverityBand, number>;
  const statusCounts = {
    ...Object.fromEntries(
      STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]),
    ),
    NOT_INVESTIGATED: rows.filter((r) => r.status === null).length,
  };
  const consequenceCounts = Object.fromEntries(
    CONSEQUENCES.map((c) => [
      c,
      rows.filter((r) => r.candidate.consequence_class === c).length,
    ]),
  ) as Record<ConsequenceClass, number>;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (bands.size > 0 && !bands.has(r.candidate.band)) return false;
      if (statuses.size > 0) {
        const key = r.status ?? "NOT_INVESTIGATED";
        if (!statuses.has(key)) return false;
      }
      if (
        consequences.size > 0 &&
        !consequences.has(r.candidate.consequence_class)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, bands, statuses, consequences]);

  const investigated = filtered.filter((r) => r.status !== null);
  const triageOnly = filtered.filter((r) => r.status === null);
  const visible = [...investigated, ...triageOnly];
  cursorRef.current = cursor;
  visibleRef.current = visible;

  const maxDelta = Math.max(
    0,
    ...filtered.map((r) => r.candidate.delta_ratio?.value ?? 0),
  );
  const maxConsequence = Math.max(1, ...Object.values(consequenceCounts));
  const hist = histogramBins(
    rows.map((r) => r.candidate.severity_index.value),
    SEVERITY_HIST_EDGES,
  );
  const histMax = Math.max(1, ...hist);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "/") {
        e.preventDefault();
        filterRef.current?.querySelector("button")?.focus();
        return;
      }
      const vis = visibleRef.current;
      if (e.key === "j") {
        e.preventDefault();
        setCursor((c) => Math.min(vis.length - 1, c + 1));
      }
      if (e.key === "k") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      }
      const row = vis[cursorRef.current];
      if (!row) return;
      if (e.key === " ") {
        e.preventDefault();
        setExpanded((set) => toggleIn(set, row.candidate.id));
      }
      if (e.key === "Enter" && row.status) {
        window.location.href = `/investigate/${row.candidate.id}`;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="stack">
      <h1 className="display">Command Centre</h1>

      <div ref={filterRef} className="stack">
        <FilterRow label="band">
          {BANDS.map((b) => (
            <Chip
              key={b}
              active={bands.has(b)}
              tone={b === "HIGH" ? "critical" : b === "MEDIUM" ? "elevated" : "inert"}
              onClick={() => setBands((s) => toggleIn(s, b))}
            >
              {b} {bandCounts[b]}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="status">
          {STATUSES.filter((s) => statusCounts[s] > 0).map((s) => (
            <Chip
              key={s}
              active={statuses.has(s)}
              tone={s === "NOT_AN_INCIDENT" ? "settled" : s === "UNCERTAIN" ? "elevated" : "inert"}
              onClick={() => setStatuses((set) => toggleIn(set, s))}
            >
              {s} {statusCounts[s]}
            </Chip>
          ))}
          <Chip
            active={statuses.has("NOT_INVESTIGATED")}
            tone="inert"
            onClick={() =>
              setStatuses((set) => toggleIn(set, "NOT_INVESTIGATED"))
            }
          >
            not investigated {statusCounts.NOT_INVESTIGATED}
          </Chip>
        </FilterRow>
        <FilterRow label="consequence">
          {CONSEQUENCES.map((c) => (
            <Chip
              key={c}
              active={consequences.has(c)}
              tone={consequenceTone(c)}
              onClick={() => setConsequences((s) => toggleIn(s, c))}
            >
              {c} {consequenceCounts[c]}
            </Chip>
          ))}
        </FilterRow>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="signal mix" meta="consequence class">
          <div className="stack" style={{ gap: 6 }}>
            {CONSEQUENCES.map((c) => (
              <CountBar
                key={c}
                label={c}
                count={consequenceCounts[c]}
                max={maxConsequence}
                tone={consequenceTone(c)}
              />
            ))}
          </div>
        </Panel>
        <Panel title="severity distribution" meta="severity_index">
          <Histogram counts={hist} max={histMax} edges={SEVERITY_HIST_EDGES} />
        </Panel>
        <Panel title="run" meta={formatTimestamp(timestamp)}>
          <p className="mono">{runId}</p>
          <p className="mono text-mute">{model}</p>
          <p className="dense mt-2">
            <span className="figure">{rows.filter((r) => r.status).length}</span>
            <span className="label ml-2">of {rows.length} investigated</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {STATUSES.filter((s) => statusCounts[s] > 0).map((s) => (
              <StatusMark key={s} status={s} />
            ))}
          </div>
        </Panel>
      </div>

      <TableSection
        title="investigated"
        count={investigated.length}
        rows={investigated}
        full
        cursorId={visible[cursor]?.candidate.id}
        expanded={expanded}
        maxDelta={maxDelta}
        onToggle={(id) => setExpanded((s) => toggleIn(s, id))}
        onCursor={(id) =>
          setCursor(visible.findIndex((r) => r.candidate.id === id))
        }
      />
      <TableSection
        title="triage only"
        count={triageOnly.length}
        rows={triageOnly}
        full={false}
        cursorId={visible[cursor]?.candidate.id}
        expanded={expanded}
        maxDelta={maxDelta}
        onToggle={(id) => setExpanded((s) => toggleIn(s, id))}
        onCursor={(id) =>
          setCursor(visible.findIndex((r) => r.candidate.id === id))
        }
      />
    </div>
  );
}

function Chip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "critical" | "elevated" | "settled" | "inert";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "critical"
      ? "chip-critical"
      : tone === "elevated"
        ? "chip-elevated"
        : tone === "settled"
          ? "chip-settled"
          : "chip-inert";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${active ? "chip-on" : toneClass}`}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label w-24 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Histogram({
  counts,
  max,
  edges,
}: {
  counts: number[];
  max: number;
  edges: readonly number[];
}) {
  return (
    <div className="flex items-end gap-px h-16">
            {counts.map((n, i) => {
        const lo = edges[i]!;
        const hi = edges[i + 1]!;
        const cut = lo === MEDIUM_THRESHOLD || lo === HIGH_THRESHOLD;
        const h = max <= 0 ? 0 : (n / max) * 100;
        return (
          <div
            key={i}
            className={`flex-1 flex flex-col justify-end h-full ${cut ? "border-l border-graphite" : ""}`}
            title={`${lo}–${hi}: ${n}`}
          >
            <div
              className={`w-full ${lo >= HIGH_THRESHOLD ? "bg-critical-tint" : lo >= MEDIUM_THRESHOLD ? "bg-elevated-tint" : "bg-rule"}`}
              style={{ height: `${Math.max(h, n > 0 ? 8 : 0)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function TableSection({
  title,
  count,
  rows,
  full,
  cursorId,
  expanded,
  maxDelta,
  onToggle,
  onCursor,
}: {
  title: string;
  count: number;
  rows: CommandRow[];
  full: boolean;
  cursorId?: string;
  expanded: Set<string>;
  maxDelta: number;
  onToggle: (id: string) => void;
  onCursor: (id: string) => void;
}) {
  return (
    <Panel title={title} meta={String(count)} flush>
      <table className={`w-full border-collapse text-left ${full ? "" : "text-mute"}`}>
        <thead>
          <tr className="label border-b border-rule">
            <th className="px-4 py-2 font-normal">candidate</th>
            <th className="px-2 py-2 font-normal">kind</th>
            <th className="px-2 py-2 font-normal">band</th>
            <th className="px-2 py-2 font-normal">affected</th>
            <th className="px-2 py-2 font-normal">rate delta</th>
            <th className="px-2 py-2 font-normal">trend</th>
            <th className="px-2 py-2 font-normal">consequence</th>
            <th className="px-4 py-2 font-normal">status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <CandidateRows
              key={r.candidate.id}
              row={r}
              full={full}
              active={cursorId === r.candidate.id}
              open={expanded.has(r.candidate.id)}
              maxDelta={maxDelta}
              onToggle={() => onToggle(r.candidate.id)}
              onCursor={() => onCursor(r.candidate.id)}
            />
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function CandidateRows({
  row,
  full,
  active,
  open,
  maxDelta,
  onToggle,
  onCursor,
}: {
  row: CommandRow;
  full: boolean;
  active: boolean;
  open: boolean;
  maxDelta: number;
  onToggle: () => void;
  onCursor: () => void;
}) {
  const c = row.candidate;
  const ratio = c.delta_ratio?.value ?? null;
  const tone = deltaTone(ratio, c.band);
  const scored = computeSeverity(c.severity_inputs);
  const cell =
    tone === "critical"
      ? "cell-critical"
      : tone === "elevated"
        ? "cell-elevated"
        : tone === "settled"
          ? "cell-settled"
          : "";

  return (
    <>
      <tr
        className={`border-b border-rule ${full ? "bg-card" : ""} ${active ? "outline outline-1 outline-ink" : ""} ${full ? "" : "dense"}`}
        onClick={onCursor}
      >
        <td className="px-4 py-1.5 align-top">
          <button type="button" className="text-left" onClick={onToggle}>
            <p className="mono text-mute">{c.id}</p>
            <p className={full ? "dense font-medium text-ink" : "dense"}>
              {subject(c)}
            </p>
          </button>
        </td>
        <td className="px-2 py-1.5 align-top mono">{c.kind}</td>
        <td className="px-2 py-1.5 align-top">
          <BandMark band={c.band} />
        </td>
        <td className="px-2 py-1.5 align-top mono tabular-nums">
          {formatNumber(c.affected_users.value)}
        </td>
        <td className={`px-2 py-1.5 align-top ${cell}`}>
          {c.delta_ratio ? (
            <MagBar
              value={c.delta_ratio.value}
              max={maxDelta}
              tone={tone}
              label={formatNumber(c.delta_ratio.value)}
            />
          ) : (
            <span className="mono text-mute">—</span>
          )}
        </td>
        <td className="px-2 py-1.5 align-top mono">{c.trend}</td>
        <td className="px-2 py-1.5 align-top mono">{c.consequence_class}</td>
        <td className="px-4 py-1.5 align-top">
          {full && row.status ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusMark status={row.status} />
              <Link href={`/investigate/${c.id}`} className="dense font-medium">
                Open
              </Link>
            </div>
          ) : (
            <span className="mono text-mute">—</span>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-rule">
          <td colSpan={8} className="px-4 py-3 bg-paper">
            <div className="grid gap-4 md:grid-cols-2 dense">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="label">rate window</dt>
                <dd className="mono m-0">
                  {formatNumber(c.rate_window.value)} {c.rate_window.unit}
                </dd>
                <dt className="label">rate prior</dt>
                <dd className="mono m-0">
                  {formatNumber(c.rate_prior.value)} {c.rate_prior.unit}
                </dd>
                <dt className="label">ratio</dt>
                <dd className="mono m-0">
                  {ratio === null ? "—" : formatNumber(ratio)}
                </dd>
                <dt className="label">prior_events</dt>
                <dd className="mono m-0">
                  {formatNumber(c.prior_events.value)}
                </dd>
                <dt className="label">ci_excludes_one</dt>
                <dd className="mono m-0">{String(c.ci_excludes_one)}</dd>
                <dt className="label">trend</dt>
                <dd className="mono m-0">{c.trend}</dd>
              </dl>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="label">consequence</dt>
                <dd className="mono m-0">
                  {c.consequence_class} · {CONSEQUENCE_WEIGHT[c.consequence_class]}
                </dd>
                <dt className="label">affected_factor</dt>
                <dd className="mono m-0">{formatNumber(scored.affected_factor)}</dd>
                <dt className="label">delta_factor</dt>
                <dd className="mono m-0">
                  {formatNumber(scored.delta_factor)}
                  {scored.delta_factor_floored ? " floored" : ""}
                </dd>
                <dt className="label">trend_factor</dt>
                <dd className="mono m-0">{formatNumber(scored.trend_factor)}</dd>
                <dt className="label">severity_index</dt>
                <dd className="mono m-0">
                  {formatNumber(scored.severity_index)} = (0.5·
                  {formatNumber(scored.affected_factor)} + 0.5·
                  {formatNumber(scored.delta_factor)}) ·{" "}
                  {formatNumber(scored.trend_factor)} ·{" "}
                  {formatNumber(scored.consequence_weight)}
                </dd>
              </dl>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
