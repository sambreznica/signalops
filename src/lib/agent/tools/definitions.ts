import type { ToolName } from "../../schema";
import {
  BREAKDOWN_DIMENSIONS,
  COMPARE_VERSIONS_REQUIRED,
  DOC_IDS,
  FIND_SIMILAR_INCIDENTS_REQUIRED,
  QUERY_TELEMETRY_REQUIRED,
  SEARCH_FEEDBACK_REQUIRED,
  SEARCH_KNOWLEDGE_REQUIRED,
  SUPPORT_TAGS,
  TELEMETRY_METRICS,
  VERSION_AXES,
} from "./args";
import {
  APP_VERSIONS,
  COHORTS,
  FIRMWARE_VERSIONS,
  REGIONS,
} from "../../fixtures/constants";
import { WINDOW_LABELS } from "./windows";

export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  input_schema: JsonSchemaObject;
};

const firmwareEnum = { type: "string", enum: [...FIRMWARE_VERSIONS] };
const appEnum = { type: "string", enum: [...APP_VERSIONS] };
const regionEnum = { type: "string", enum: [...REGIONS] };
const cohortEnum = { type: "string", enum: [...COHORTS] };
const windowEnum = { type: "string", enum: [...WINDOW_LABELS] };
const metricEnum = { type: "string", enum: [...TELEMETRY_METRICS] };
const tagEnum = { type: "string", enum: [...SUPPORT_TAGS] };

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "query_telemetry",
    description:
      "Return aggregated telemetry for one metric over a named date window. Optional filters: firmware version, app version, region, cohort. Optional breakdown by one dimension. Does not return per-device rows.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [...QUERY_TELEMETRY_REQUIRED],
      properties: {
        metric: metricEnum,
        window: windowEnum,
        firmware_version: firmwareEnum,
        app_version: appEnum,
        region: regionEnum,
        cohort: cohortEnum,
        breakdown: { type: "string", enum: [...BREAKDOWN_DIMENSIONS] },
      },
    },
  },
  {
    name: "compare_versions",
    description:
      "Compare one telemetry metric between two versions on a single axis (firmware or app). Optional hold-filters apply the same constraint to both sides. Returns rates, ratio, cohort sizes, and whether the rate-ratio interval excludes one.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [...COMPARE_VERSIONS_REQUIRED],
      properties: {
        metric: metricEnum,
        window: windowEnum,
        axis: { type: "string", enum: [...VERSION_AXES] },
        version_a: { type: "string" },
        version_b: { type: "string" },
        hold: {
          type: "object",
          additionalProperties: false,
          properties: {
            firmware_version: firmwareEnum,
            app_version: appEnum,
            region: regionEnum,
            cohort: cohortEnum,
          },
        },
      },
    },
  },
  {
    name: "search_feedback",
    description:
      "Find support-feedback records whose text or tags match a query string. Optional filters: tag, region, firmware version, app version, date window. Returns match counts by tag and a small sample of matching records.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [...SEARCH_FEEDBACK_REQUIRED],
      properties: {
        query: { type: "string" },
        window: windowEnum,
        tag: tagEnum,
        region: regionEnum,
        firmware_version: firmwareEnum,
        app_version: appEnum,
      },
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search the internal knowledge corpus by semantic similarity. Optionally restrict to one document id (KD-01 through KD-06). Returns top matching chunks with document, section, chunk id, and score.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [...SEARCH_KNOWLEDGE_REQUIRED],
      properties: {
        query: { type: "string" },
        doc_id: { type: "string", enum: [...DOC_IDS] },
        k: { type: "integer", minimum: 1, maximum: 8 },
      },
    },
  },
  {
    name: "find_similar_incidents",
    description:
      "Search the historical incident log for closed incidents whose text is similar to a description. Returns ranked incidents with recorded resolution and outcome. Does not search live investigations.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [...FIND_SIMILAR_INCIDENTS_REQUIRED],
      properties: {
        description: { type: "string" },
      },
    },
  },
];
