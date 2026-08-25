import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasBareNumeral } from "../schema";
import { factsFromToolResults } from "./bound-record";
import { invoke } from "./tools/invoke";
import { loadStaticRuntime } from "./tools/runtime";
import type { InvokeContext } from "./tools/types";

const ROOT = path.resolve(__dirname, "../../..");
const CTX: InvokeContext = { call_id: "tc_1", actor: "investigator" };

describe("factsFromToolResults", () => {
  const runtime = loadStaticRuntime(ROOT, async () => [0]);

  it("projects compare_versions rates and ratio from tool JSON, not from result_summary", async () => {
    const outcome = await invoke(
      "compare_versions",
      {
        metric: "ble_disconnects_24h",
        window: "current",
        axis: "firmware_version",
        version_a: "1.4.1",
        version_b: "1.4.2",
      },
      CTX,
      runtime,
    );
    expect(outcome.result.ok).toBe(true);
    const facts = factsFromToolResults([
      {
        call_id: "tc_1",
        tool: "compare_versions",
        arguments: outcome.event.arguments,
        result: outcome.result,
      },
    ]);
    const labels = facts.deterministic_findings.map((f) => f.label);
    expect(labels.some((l) => l.includes("1.4.2"))).toBe(true);
    expect(facts.deterministic_findings.some((f) => f.unit === "ratio")).toBe(
      true,
    );
    for (const finding of facts.deterministic_findings) {
      expect(hasBareNumeral(finding.label)).toBe(false);
      expect(finding.source).toEqual({ kind: "tool_call", call_id: "tc_1" });
    }
  });

  it("copies search_knowledge chunks into knowledge_sources without inventing ids", () => {
    const facts = factsFromToolResults([
      {
        call_id: "tc_2",
        tool: "search_knowledge",
        arguments: { query: "BLE supervisor", doc_id: "KD-02" },
        result: {
          ok: true,
          chunks: [
            {
              doc_id: "KD-02",
              title: "Firmware Release Notes",
              section: "BLE (1.4.2)",
              chunk_id: "KD-02#ble-1-4-2#1",
              score: 0.81,
              text: "not copied",
            },
          ],
        },
      },
    ]);
    expect(facts.knowledge_sources).toEqual([
      {
        doc_id: "KD-02",
        title: "Firmware Release Notes",
        section: "BLE (1.4.2)",
        chunk_id: "KD-02#ble-1-4-2#1",
        score: 0.81,
      },
    ]);
  });

  it("skips failed tool calls", () => {
    const facts = factsFromToolResults([
      {
        call_id: "tc_3",
        tool: "query_telemetry",
        arguments: { metric: "ble_disconnects_24h" },
        result: { ok: false, error: "window required" },
      },
    ]);
    expect(facts.deterministic_findings).toEqual([]);
    expect(facts.knowledge_sources).toEqual([]);
  });
});
