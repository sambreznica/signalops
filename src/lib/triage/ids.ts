import type { FirmwareVersion, SupportTag } from "../fixtures/constants";
import type { TelemetryMetric } from "../analytics/types";

/** Subject-matter metric for a tag. Unmapped tags use ticket incidence. */
export const TAG_TELEMETRY_METRIC: Partial<Record<SupportTag, TelemetryMetric>> = {
  connectivity: "ble_disconnects_24h",
  "app-sync": "ble_disconnects_24h",
  adhesion: "adhesion_flag",
  "skin-irritation": "adhesion_flag",
  "comfort-fit": "adhesion_flag",
  battery: "battery_drain_pct",
  overheating: "battery_drain_pct",
};

export function tagCandidateId(tag: SupportTag): string {
  return `cnd_tag_${tag.replaceAll("-", "_")}`;
}

export function firmwareCandidateId(version: FirmwareVersion): string {
  return `cnd_fw_${version.replaceAll(".", "_")}`;
}
