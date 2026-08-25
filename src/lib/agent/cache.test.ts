import { describe, expect, it } from "vitest";
import { cacheKey, createMemoryCache } from "./cache";

describe("tool cache", () => {
  it("keys by tool and canonical args, not key order", () => {
    expect(
      cacheKey("query_telemetry", { window: "current", metric: "adhesion_flag" }),
    ).toBe(
      cacheKey("query_telemetry", { metric: "adhesion_flag", window: "current" }),
    );
  });

  it("counts hits and misses", () => {
    const cache = createMemoryCache();
    const args = { metric: "adhesion_flag", window: "current" };
    expect(cache.get("query_telemetry", args)).toBeUndefined();
    cache.set("query_telemetry", args, { ok: true, empty: true });
    expect(cache.get("query_telemetry", args)?.ok).toBe(true);
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(1);
  });
});
