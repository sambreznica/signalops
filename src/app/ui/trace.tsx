"use client";

import type { TraceEvent } from "@/lib/schema/investigation";
import { compactArgs } from "@/lib/replay/format";

const ERROR_SUMMARIES = new Set(["tool_error", "args_invalid"]);
const EMPTY_SUMMARIES = new Set([
  "filter_matched_no_devices",
  "no_events",
]);

export function Trace({
  events,
  selectedCallId,
  onSelect,
}: {
  events: readonly TraceEvent[];
  selectedCallId: string | null;
  onSelect: (callId: string) => void;
}) {
  const calls = events.filter((e) => e.kind === "tool_call");
  if (calls.length === 0 && !events.some((e) => e.kind === "critic_effect")) {
    return <p className="dense text-mute">No tool_call events in this record.</p>;
  }
  let n = 0;
  return (
    <ol className="list-none p-0 m-0">
      {events.map((event, i) => {
        if (event.kind === "ceiling_applied") return null;
        if (event.kind === "critic_effect") {
          return (
            <li key={`fx-${i}`} className="border-l-2 border-graphite py-1.5 pl-2.5 ml-3">
              <p className="label">critic effect</p>
              <p className="mono text-graphite">
                {event.effect} · {event.detail}
              </p>
            </li>
          );
        }
        n += 1;
        const critic = event.actor === "critic";
        const error = ERROR_SUMMARIES.has(event.result_summary);
        const empty = EMPTY_SUMMARIES.has(event.result_summary);
        const hot = selectedCallId === event.call_id;
        return (
          <li
            key={event.call_id}
            id={event.call_id}
            className={`trace-row scroll-mt-2 border-l-2 py-1.5 pl-2.5 ${
              critic ? "ml-3 border-graphite" : "border-ink"
            } ${error ? "cell-critical" : ""} ${hot ? "is-hot" : ""}`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onSelect(event.call_id)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="mono text-mute w-4 shrink-0">{n}</span>
                  {critic ? <span className="chip chip-inert">CRITIC</span> : null}
                  <span className="mono font-medium truncate">{event.tool}</span>
                </div>
                <span className="mono text-mute shrink-0">
                  {event.call_id} · {event.latency_ms}ms
                </span>
              </div>
              <p className="mono text-mute mt-0.5 pl-6 break-all">
                {compactArgs(event.arguments)}
              </p>
              <p
                className={`mono mt-0.5 pl-6 ${empty ? "text-mute" : error ? "text-critical" : ""}`}
              >
                {event.result_summary}
              </p>
            </button>
            <details className="ml-6 mt-1">
              <summary className="cursor-pointer label">arguments</summary>
              <pre className="mono mt-1 overflow-x-auto bg-paper p-2">
                {JSON.stringify(event.arguments, null, 2)}
              </pre>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
