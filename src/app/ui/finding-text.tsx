import type { DeterministicFinding } from "@/lib/schema/investigation";
import { splitFindingText } from "@/lib/replay/findings";
import { formatNumber } from "@/lib/replay/format";

export function FindingText({
  text,
  findings,
  hotCall = null,
  onCall,
}: {
  text: string;
  findings: readonly DeterministicFinding[];
  hotCall?: string | null;
  onCall?: (callId: string) => void;
}) {
  const segments = splitFindingText(text, findings);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "unresolved") {
          return (
            <span key={i} className="chip-broken" title={`unresolved {${seg.id}}`}>
              {`{${seg.id}}`}
            </span>
          );
        }
        const hot = Boolean(seg.callId && seg.callId === hotCall);
        const body = (
          <span className={`chip-finding ${hot ? "is-hot" : ""}`}>
            {`${formatNumber(seg.value)} ${seg.unit}`}
          </span>
        );
        if (seg.callId) {
          const id = seg.callId;
          return (
            <a
              key={i}
              href={`#${id}`}
              className="no-underline"
              onClick={() => onCall?.(id)}
            >
              {body}
            </a>
          );
        }
        return <span key={i}>{body}</span>;
      })}
    </>
  );
}
