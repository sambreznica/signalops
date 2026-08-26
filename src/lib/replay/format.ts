import type { Quantity } from "../schema/quantity";

/** Presentation of a typed claim. Does not invent a value. */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(2);
  if (abs >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

export function formatQuantity(q: Quantity): string {
  return `${formatNumber(q.value)} ${q.unit}`;
}

export function compactArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}=${v}`;
      if (typeof v === "number" || typeof v === "boolean") return `${k}=${String(v)}`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .join(" ");
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm} UTC`;
}

export function slugId(id: string): string {
  return id.replaceAll("#", "__");
}
