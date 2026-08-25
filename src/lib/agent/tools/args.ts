import { z } from "zod";
import {
  APP_VERSIONS,
  COHORTS,
  FIRMWARE_VERSIONS,
  REGIONS,
  TAG_TAXONOMY,
} from "../../fixtures/constants";
import { WINDOW_LABELS } from "./windows";

function tuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  return values as [T, ...T[]];
}

export const TELEMETRY_METRICS = [
  "ble_disconnects_24h",
  "session_gap_minutes",
  "adhesion_flag",
  "motion_intensity",
  "skin_temp_delta_c",
  "battery_drain_pct",
] as const;

export const BREAKDOWN_DIMENSIONS = [
  "firmware_version",
  "app_version",
  "region",
  "cohort",
  "activity_level",
] as const;

export const VERSION_AXES = ["firmware_version", "app_version"] as const;

export const DOC_IDS = [
  "KD-01",
  "KD-02",
  "KD-03",
  "KD-04",
  "KD-05",
  "KD-06",
] as const;

export const SUPPORT_TAGS = TAG_TAXONOMY.map((entry) => entry.tag);

const firmwareSchema = z.enum(tuple(FIRMWARE_VERSIONS));
const appSchema = z.enum(tuple(APP_VERSIONS));
const regionSchema = z.enum(tuple(REGIONS));
const cohortSchema = z.enum(tuple(COHORTS));
const tagSchema = z.enum(tuple(SUPPORT_TAGS));
const metricSchema = z.enum(tuple(TELEMETRY_METRICS));
const windowSchema = z.enum(tuple(WINDOW_LABELS));
const axisSchema = z.enum(tuple(VERSION_AXES));
const docIdSchema = z.enum(tuple(DOC_IDS));
const breakdownSchema = z.enum(tuple(BREAKDOWN_DIMENSIONS));

const holdSchema = z.strictObject({
  firmware_version: firmwareSchema.optional(),
  app_version: appSchema.optional(),
  region: regionSchema.optional(),
  cohort: cohortSchema.optional(),
});

export const QUERY_TELEMETRY_REQUIRED = ["metric", "window"] as const;
export const COMPARE_VERSIONS_REQUIRED = [
  "metric",
  "window",
  "axis",
  "version_a",
  "version_b",
] as const;
export const SEARCH_FEEDBACK_REQUIRED = ["query", "window"] as const;
export const SEARCH_KNOWLEDGE_REQUIRED = ["query"] as const;
export const FIND_SIMILAR_INCIDENTS_REQUIRED = ["description"] as const;

export const queryTelemetryArgsSchema = z.strictObject({
  metric: metricSchema,
  window: windowSchema,
  firmware_version: firmwareSchema.optional(),
  app_version: appSchema.optional(),
  region: regionSchema.optional(),
  cohort: cohortSchema.optional(),
  breakdown: breakdownSchema.optional(),
});

export const compareVersionsArgsSchema = z
  .strictObject({
    metric: metricSchema,
    window: windowSchema,
    axis: axisSchema,
    version_a: z.string(),
    version_b: z.string(),
    hold: holdSchema.optional(),
  })
  .superRefine((val, ctx) => {
    const allowed =
      val.axis === "firmware_version" ? FIRMWARE_VERSIONS : APP_VERSIONS;
    if (!(allowed as readonly string[]).includes(val.version_a)) {
      ctx.addIssue({
        code: "custom",
        path: ["version_a"],
        message: "version_a does not match axis",
      });
    }
    if (!(allowed as readonly string[]).includes(val.version_b)) {
      ctx.addIssue({
        code: "custom",
        path: ["version_b"],
        message: "version_b does not match axis",
      });
    }
    if (
      val.axis === "firmware_version" &&
      val.hold?.firmware_version !== undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["hold", "firmware_version"],
        message: "hold.firmware_version is not valid when axis is firmware_version",
      });
    }
    if (val.axis === "app_version" && val.hold?.app_version !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["hold", "app_version"],
        message: "hold.app_version is not valid when axis is app_version",
      });
    }
  });

export const searchFeedbackArgsSchema = z.strictObject({
  query: z.string().min(1),
  window: windowSchema,
  tag: tagSchema.optional(),
  region: regionSchema.optional(),
  firmware_version: firmwareSchema.optional(),
  app_version: appSchema.optional(),
});

export const searchKnowledgeArgsSchema = z.strictObject({
  query: z.string().min(1),
  doc_id: docIdSchema.optional(),
  k: z.number().int().optional(),
});

export const findSimilarIncidentsArgsSchema = z.strictObject({
  description: z.string().min(1),
});

export type QueryTelemetryArgs = z.infer<typeof queryTelemetryArgsSchema>;
export type CompareVersionsArgs = z.infer<typeof compareVersionsArgsSchema>;
export type SearchFeedbackArgs = z.infer<typeof searchFeedbackArgsSchema>;
export type SearchKnowledgeArgs = z.infer<typeof searchKnowledgeArgsSchema>;
export type FindSimilarIncidentsArgs = z.infer<
  typeof findSimilarIncidentsArgsSchema
>;
