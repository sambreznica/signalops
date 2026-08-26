export type ExceptionTone = "critical" | "elevated" | "settled" | "inert";

export function MagBar({
  value,
  max,
  tone,
  label,
}: {
  value: number;
  max: number;
  tone: ExceptionTone;
  label: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <span className="mag">
      <span className={`mag-fill mag-${tone}`} style={{ width: `${pct}%` }} />
      <span className="relative z-10 mono tabular-nums px-1">{label}</span>
    </span>
  );
}

export function CountBar({
  count,
  max,
  tone,
  label,
}: {
  count: number;
  max: number;
  tone: ExceptionTone;
  label: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (count / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="mono w-[9.5rem] shrink-0 truncate">{label}</span>
      <span className="mag flex-1">
        <span className={`mag-fill mag-${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="mono tabular-nums w-6 text-right">{count}</span>
    </div>
  );
}
