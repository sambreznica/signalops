import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "./definitions";
import {
  COMPARE_VERSIONS_REQUIRED,
  FIND_SIMILAR_INCIDENTS_REQUIRED,
  QUERY_TELEMETRY_REQUIRED,
  SEARCH_FEEDBACK_REQUIRED,
  SEARCH_KNOWLEDGE_REQUIRED,
  compareVersionsArgsSchema,
  findSimilarIncidentsArgsSchema,
  queryTelemetryArgsSchema,
  searchFeedbackArgsSchema,
  searchKnowledgeArgsSchema,
} from "./args";

const SCHEMA_BY_TOOL = {
  query_telemetry: {
    zod: queryTelemetryArgsSchema,
    required: QUERY_TELEMETRY_REQUIRED,
    valid: { metric: "ble_disconnects_24h", window: "current" },
  },
  compare_versions: {
    zod: compareVersionsArgsSchema,
    required: COMPARE_VERSIONS_REQUIRED,
    valid: {
      metric: "ble_disconnects_24h",
      window: "current",
      axis: "firmware_version",
      version_a: "1.4.2",
      version_b: "1.4.1",
    },
  },
  search_feedback: {
    zod: searchFeedbackArgsSchema,
    required: SEARCH_FEEDBACK_REQUIRED,
    valid: { query: "battery", window: "current" },
  },
  search_knowledge: {
    zod: searchKnowledgeArgsSchema,
    required: SEARCH_KNOWLEDGE_REQUIRED,
    valid: { query: "supervisor timeout" },
  },
  find_similar_incidents: {
    zod: findSimilarIncidentsArgsSchema,
    required: FIND_SIMILAR_INCIDENTS_REQUIRED,
    valid: { description: "disconnect cluster on a firmware train" },
  },
} as const;

describe("tool JSON schema / Zod parity", () => {
  it("exposes exactly the five frozen tools", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      "query_telemetry",
      "compare_versions",
      "search_feedback",
      "search_knowledge",
      "find_similar_incidents",
    ]);
  });

  it("keeps required keys identical between Zod and the hand-written JSON schema", () => {
    for (const def of TOOL_DEFINITIONS) {
      const spec = SCHEMA_BY_TOOL[def.name];
      expect(def.input_schema.required).toEqual([...spec.required]);
      expect(spec.zod.safeParse(spec.valid).success).toBe(true);
      for (const key of spec.required) {
        const rest = { ...spec.valid } as Record<string, unknown>;
        delete rest[key];
        expect(
          spec.zod.safeParse(rest).success,
          `${def.name} should reject missing ${key}`,
        ).toBe(false);
      }
    }
  });

  it("does not treat omitted window as current", () => {
    expect(
      queryTelemetryArgsSchema.safeParse({ metric: "ble_disconnects_24h" })
        .success,
    ).toBe(false);
    expect(
      compareVersionsArgsSchema.safeParse({
        metric: "ble_disconnects_24h",
        axis: "firmware_version",
        version_a: "1.4.2",
        version_b: "1.4.1",
      }).success,
    ).toBe(false);
    expect(
      searchFeedbackArgsSchema.safeParse({ query: "battery" }).success,
    ).toBe(false);
  });

  it("requires axis on compare_versions", () => {
    expect(
      compareVersionsArgsSchema.safeParse({
        metric: "ble_disconnects_24h",
        window: "current",
        version_a: "1.4.2",
        version_b: "1.4.1",
      }).success,
    ).toBe(false);
  });

  it("rejects a version that does not match the axis", () => {
    expect(
      compareVersionsArgsSchema.safeParse({
        metric: "ble_disconnects_24h",
        window: "current",
        axis: "firmware_version",
        version_a: "3.2",
        version_b: "1.4.1",
      }).success,
    ).toBe(false);
  });
});

describe("tool descriptions", () => {
  it("stay operational and do not name a conclusion", () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.description).not.toMatch(/1\.4\.2|regression|SIG-|caused/i);
    }
  });
});
