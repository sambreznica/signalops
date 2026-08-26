"use client";

import { useEffect, useMemo, useState } from "react";
import type { KnowledgeDoc } from "@/lib/replay/load";
import { slugId } from "@/lib/replay/format";
import { Panel } from "./panel";
import { MagBar } from "./bars";

export function KnowledgeView({ docs }: { docs: KnowledgeDoc[] }) {
  const total = docs.reduce((n, d) => n + d.chunk_count, 0);
  const max = Math.max(1, ...docs.map((d) => d.chunk_count));
  const [selected, setSelected] = useState(docs[0]?.doc_id ?? "");
  const [openChunk, setOpenChunk] = useState<string | null>(null);

  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      for (const doc of docs) {
        if (doc.doc_id === hash) {
          setSelected(doc.doc_id);
          return;
        }
        const chunk = doc.chunks.find((c) => slugId(c.chunk_id) === hash);
        if (chunk) {
          setSelected(doc.doc_id);
          setOpenChunk(chunk.chunk_id);
          requestAnimationFrame(() => {
            document.getElementById(slugId(chunk.chunk_id))?.scrollIntoView({
              block: "center",
            });
          });
          return;
        }
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [docs]);

  const doc = useMemo(
    () => docs.find((d) => d.doc_id === selected) ?? docs[0],
    [docs, selected],
  );
  const sections = useMemo(() => {
    if (!doc) return [];
    const map = new Map<string, typeof doc.chunks>();
    for (const chunk of doc.chunks) {
      const list = map.get(chunk.section) ?? [];
      list.push(chunk);
      map.set(chunk.section, list);
    }
    return [...map.entries()];
  }, [doc]);

  if (!doc) return null;

  return (
    <div>
      <h1 className="display">Knowledge</h1>
      <p className="label mt-1">
        {docs.length} documents · {total} chunks
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
        <Panel title="documents" meta={String(docs.length)}>
          <ul className="stack" style={{ gap: 8 }}>
            {docs.map((d) => (
              <li key={d.doc_id}>
                <button
                  type="button"
                  className={`w-full text-left ${selected === d.doc_id ? "font-medium" : ""}`}
                  onClick={() => setSelected(d.doc_id)}
                >
                  <p className="mono">{d.doc_id}</p>
                  <p className="dense text-mute truncate">{d.title}</p>
                  <MagBar
                    value={d.chunk_count}
                    max={max}
                    tone="inert"
                    label={String(d.chunk_count)}
                  />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={doc.doc_id} meta={`${doc.chunk_count} chunks`}>
          <p className="dense mb-3">{doc.title}</p>
          {sections.map(([section, chunks]) => (
            <details key={section} className="border-t border-rule py-2" open>
              <summary className="cursor-pointer dense font-medium">
                {section}{" "}
                <span className="mono text-mute">{chunks.length}</span>
              </summary>
              <ul>
                {chunks.map((chunk) => {
                  const hot = openChunk === chunk.chunk_id;
                  return (
                    <li
                      key={chunk.chunk_id}
                      id={slugId(chunk.chunk_id)}
                      className={`chunk-row py-2 ${hot ? "is-hot" : ""}`}
                    >
                      <details open={hot}>
                        <summary className="cursor-pointer mono text-mute">
                          {chunk.chunk_id}
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap body">
                          {chunk.text}
                        </pre>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </Panel>
      </div>
    </div>
  );
}
