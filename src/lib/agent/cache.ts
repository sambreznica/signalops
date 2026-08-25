import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ToolName } from "../schema";
import type { ToolResult } from "./tools/types";

export type ToolCache = {
  get(tool: ToolName, args: unknown): ToolResult | undefined;
  set(tool: ToolName, args: unknown, result: ToolResult): void;
  hits: number;
  misses: number;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function cacheKey(tool: ToolName, args: unknown): string {
  return createHash("sha256")
    .update(tool)
    .update("\0")
    .update(canonical(args))
    .digest("hex");
}

export function corpusFingerprint(root: string): string {
  const files = [
    "synthetic-data/telemetry.json",
    "synthetic-data/feedback.json",
    "knowledge/embeddings.json",
  ];
  return files
    .map((rel) => {
      const full = path.join(root, rel);
      const st = statSync(full);
      return `${rel}:${st.mtimeMs}:${st.size}`;
    })
    .join("|");
}

type DiskShape = {
  fingerprint: string;
  entries: Record<string, ToolResult>;
};

export function createMemoryCache(): ToolCache {
  const entries = new Map<string, ToolResult>();
  const cache: ToolCache = {
    hits: 0,
    misses: 0,
    get(tool, args) {
      const hit = entries.get(cacheKey(tool, args));
      if (hit !== undefined) {
        cache.hits += 1;
        return hit;
      }
      cache.misses += 1;
      return undefined;
    },
    set(tool, args, result) {
      entries.set(cacheKey(tool, args), result);
    },
  };
  return cache;
}

export function createDiskCache(
  root: string,
  filePath: string,
): ToolCache {
  const fingerprint = corpusFingerprint(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  let entries: Record<string, ToolResult> = {};
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as DiskShape;
      if (parsed.fingerprint === fingerprint && parsed.entries) {
        entries = parsed.entries;
      }
    } catch {
      entries = {};
    }
  }

  const persist = () => {
    const body: DiskShape = { fingerprint, entries };
    writeFileSync(filePath, `${JSON.stringify(body)}\n`);
  };

  const cache: ToolCache = {
    hits: 0,
    misses: 0,
    get(tool, args) {
      const hit = entries[cacheKey(tool, args)];
      if (hit !== undefined) {
        cache.hits += 1;
        return hit;
      }
      cache.misses += 1;
      return undefined;
    },
    set(tool, args, result) {
      entries[cacheKey(tool, args)] = result;
      persist();
    },
  };
  return cache;
}

export function passthroughCache(): ToolCache {
  const cache: ToolCache = {
    hits: 0,
    misses: 0,
    get() {
      cache.misses += 1;
      return undefined;
    },
    set() {},
  };
  return cache;
}
