import {
  APP_VERSIONS,
  CHANNELS,
  CLUSTER_TAGS,
  COHORTS,
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  DATES_PER_WINDOW,
  DEVICE_COUNT,
  FEEDBACK_COUNT,
  FIRMWARE_142_ROLLOUT,
  FIRMWARE_VERSIONS,
  FIXTURE_SEED,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
  REGIONS,
  RESOLVER_CELL_SIZE,
  SIG_003_TICKET_COUNT,
  TAG_TAXONOMY,
  type ActivityLevel,
  type AppVersion,
  type FirmwareVersion,
  type Region,
  type SupportTag,
} from "./constants";
import { choice, mulberry32, randInt, sample, shuffle } from "./prng";
import type {
  DeviceRecord,
  FeedbackRecord,
  FixtureBundle,
  TagTaxonomyEntry,
  TelemetryRecord,
} from "./types";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function deviceId(index: number): string {
  return `KL-${pad(index + 1, 4)}`;
}

function feedbackId(index: number): string {
  return `FB-${pad(index + 1, 4)}`;
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function inCurrentWindow(date: string): boolean {
  return date >= CURRENT_WINDOW_START && date <= CURRENT_WINDOW_END;
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/** Devices observably part of a ticket cluster in the current window. */
function currentWindowDeviceIds(tickets: readonly FeedbackRecord[]): string[] {
  return uniqueSorted(
    tickets
      .filter((row) => inCurrentWindow(row.timestamp.slice(0, 10)))
      .map((row) => row.device_id),
  );
}

function round1(n: number): number {
  return Number(n.toFixed(1));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function activityForMotion(motion: number): ActivityLevel {
  if (motion >= 80) return "very_high";
  if (motion >= 55) return "high";
  if (motion >= 30) return "moderate";
  return "low";
}

type DeviceGroup = "resolver" | "fw142" | "older";

type DevicePlan = {
  device_id: string;
  region: Region;
  cohort: DeviceRecord["cohort"];
  group: DeviceGroup;
  older_firmware: FirmwareVersion;
  older_app: AppVersion;
};

const SIG_001_TEXTS = [
  "The patch keeps dropping the Bluetooth connection during the day.",
  "I have to reopen the app because the Loop disconnects overnight.",
  "Sync fails after the latest update — connection dies mid-session.",
  "Wearable unpairs from the phone every few hours. Tired of reconnecting.",
  "BLE drops when I walk between rooms. Started after the recent push.",
];

const SIG_002_TEXTS = [
  "The patch peeled off during a long run. Skin was hot underneath.",
  "Adhesive failed on a high-intensity session. Red mark where it lifted.",
  "Loop will not stay stuck when I train hard. Edges curl and itch.",
  "Sweaty workout plus warm skin and the adhesive lets go by lunch.",
  "Comfort is fine at rest. Any hard effort and it lifts off the skin.",
];

const SIG_003_TEXTS = [
  "The readiness score looks like a medical result. I showed it to my partner as if it were a clinical finding.",
  "Does a low readiness number mean I have a condition? The app presents it like a diagnosis.",
  "I treated yesterday's score as a lab result and cancelled a meeting. Need to know if that is what it is for.",
  "The number appeared next to the word ready and I read it as a health verdict, not a wellness hint.",
  "Friends asked if the score means I am sick. I did not know how to answer without sounding clinical.",
];

const SIG_004_TEXTS = [
  "Battery drains fast in the cold. Phone also feels warm when syncing.",
  "In this weather the Loop dies by evening. The app UI shows a harsh red battery.",
  "Nordic mornings kill the charge. Device gets toasty on the charger in the hotel.",
  "Battery life is poor outdoors here. Sync screen looks alarming even when it still has charge.",
  "Cold walk and the battery falls off a cliff. App overheating warning popped once too.",
];

const BENIGN_CLAIMS_TEXTS = [
  "I asked support whether readiness is medical-grade. They said it is not, which is what I needed.",
  "Just confirming the score is wellness only, not a diagnosis. Thanks for clarifying.",
  "Read the help article — score is not a medical result. All good on my side.",
];

const NOISE_TEXTS = [
  "Packaging arrived dented but the patch looks fine.",
  "Can you confirm what data the companion app uploads?",
  "Colour theme on the home screen is hard to read at night.",
  "Fit is snug on the upper arm. Not a complaint, just feedback.",
  "App sync took a moment this morning then caught up.",
  "Battery icon flickered once. Fine afterwards.",
  "Mild warmth after a session, nothing that lasted.",
  "Adhesive held for the office day. No issue.",
  "Numbers in the diary look a bit jumpy but usable.",
  "Privacy settings page is easy to find. Appreciate that.",
];

function versionsFor(
  plan: DevicePlan,
  date: string,
): { firmware_version: FirmwareVersion; app_version: AppVersion } {
  const current = inCurrentWindow(date);
  if (plan.group === "resolver") {
    return {
      firmware_version: "1.4.1",
      app_version: current ? "3.2" : "3.1",
    };
  }
  if (plan.group === "fw142") {
    return {
      firmware_version: current ? "1.4.2" : "1.4.1",
      app_version: current ? "3.2" : "3.1",
    };
  }
  return {
    firmware_version: plan.older_firmware,
    app_version: plan.older_app,
  };
}

function buildTelemetryRow(
  rng: () => number,
  plan: DevicePlan,
  date: string,
): TelemetryRecord {
  const { firmware_version, app_version } = versionsFor(plan, date);
  const current = inCurrentWindow(date);
  const dayIndex = new Date(`${date}T00:00:00Z`).getUTCDate();
  const seasonal = (dayIndex % 7) * 0.15;

  const motion_intensity = randInt(rng, 5, 98);
  const activity_level = activityForMotion(motion_intensity);
  const skin_temp_delta_c = round1(clamp(rng() * 3.6 - 0.4, -0.6, 3.4));
  const hotHard = motion_intensity >= 70 && skin_temp_delta_c >= 1.5;
  const adhesion_flag = rng() < (hotHard ? 0.62 : 0.045);

  let ble = randInt(rng, 0, 3);
  if (firmware_version === "1.4.2") {
    ble = randInt(rng, 7, 14);
  }

  let session_gap_minutes = randInt(rng, 18, 55);
  if (plan.region === "iberia" && current) {
    session_gap_minutes = randInt(rng, 95, 170);
  }

  let battery_drain_pct = round1(9 + rng() * 7 + seasonal);
  if (plan.region === "nordics") {
    battery_drain_pct = round1(battery_drain_pct + 4.5);
  }

  return {
    device_id: plan.device_id,
    date,
    firmware_version,
    app_version,
    region: plan.region,
    cohort: plan.cohort,
    ble_disconnects_24h: ble,
    session_gap_minutes,
    adhesion_flag,
    activity_level,
    motion_intensity,
    skin_temp_delta_c,
    battery_drain_pct,
  };
}

function timestampOn(rng: () => number, date: string): string {
  const hh = pad(randInt(rng, 8, 21), 2);
  const mm = pad(randInt(rng, 0, 59), 2);
  return `${date}T${hh}:${mm}:00Z`;
}

function makeFeedback(args: {
  rng: () => number;
  index: number;
  row: TelemetryRecord;
  text: string;
  tags: SupportTag[];
  channel?: FeedbackRecord["channel"];
}): FeedbackRecord {
  return {
    id: feedbackId(args.index),
    timestamp: timestampOn(args.rng, args.row.date),
    channel: args.channel ?? choice(args.rng, CHANNELS),
    device_id: args.row.device_id,
    firmware_version: args.row.firmware_version,
    app_version: args.row.app_version,
    region: args.row.region,
    text: args.text,
    tags: [...args.tags],
  };
}

function pickRow(
  rng: () => number,
  rows: TelemetryRecord[],
): TelemetryRecord {
  const row = choice(rng, rows);
  return row;
}

export function generateFixtures(seed: number = FIXTURE_SEED): FixtureBundle {
  const rng = mulberry32(seed);
  const priorDates = enumerateDates(PRIOR_WINDOW_START, PRIOR_WINDOW_END);
  const currentDates = enumerateDates(CURRENT_WINDOW_START, CURRENT_WINDOW_END);
  const taxonomy: TagTaxonomyEntry[] = TAG_TAXONOMY.map((entry) => ({
    tag: entry.tag,
    consequence_class: entry.consequence_class,
    weight: entry.weight,
  }));

  const shuffledIndexes = shuffle(
    rng,
    Array.from({ length: DEVICE_COUNT }, (_, i) => i),
  );
  const groupByIndex = new Map<number, DeviceGroup>();
  for (let i = 0; i < RESOLVER_CELL_SIZE; i++) {
    const idx = shuffledIndexes[i];
    if (idx !== undefined) groupByIndex.set(idx, "resolver");
  }
  for (let i = RESOLVER_CELL_SIZE; i < RESOLVER_CELL_SIZE + FIRMWARE_142_ROLLOUT; i++) {
    const idx = shuffledIndexes[i];
    if (idx !== undefined) groupByIndex.set(idx, "fw142");
  }

  const olderFirmware = FIRMWARE_VERSIONS.filter((v) => v !== "1.4.2" && v !== "1.4.1");
  const olderApps = APP_VERSIONS.filter((v) => v !== "3.2");

  const plans: DevicePlan[] = [];
  for (let i = 0; i < DEVICE_COUNT; i++) {
    const group = groupByIndex.get(i) ?? "older";
    plans.push({
      device_id: deviceId(i),
      region: REGIONS[i % REGIONS.length]!,
      cohort: COHORTS[i % COHORTS.length]!,
      group,
      older_firmware: choice(rng, olderFirmware),
      older_app: choice(rng, olderApps),
    });
  }

  const devices: DeviceRecord[] = plans.map((plan) => ({
    device_id: plan.device_id,
    region: plan.region,
    cohort: plan.cohort,
  }));

  const telemetry: TelemetryRecord[] = [];
  for (const plan of plans) {
    const dates = [
      ...sample(rng, priorDates, DATES_PER_WINDOW).sort(),
      ...sample(rng, currentDates, DATES_PER_WINDOW).sort(),
    ];
    telemetry.push(...dates.map((date) => buildTelemetryRow(rng, plan, date)));
  }
  telemetry.sort((a, b) =>
    a.device_id === b.device_id
      ? a.date.localeCompare(b.date)
      : a.device_id.localeCompare(b.device_id),
  );

  const fw142Rows = telemetry.filter((row) => row.firmware_version === "1.4.2");
  const adhesionRows = telemetry.filter((row) => row.adhesion_flag);
  const nordicsRows = telemetry.filter((row) => row.region === "nordics");
  const anyRows = telemetry;

  const feedback: FeedbackRecord[] = [];
  let nextFb = 0;

  const sig001Devices = [
    ...new Set(fw142Rows.map((row) => row.device_id)),
  ].sort();
  const sig001Count = 70;
  for (let i = 0; i < sig001Count; i++) {
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row: pickRow(rng, fw142Rows),
        text: choice(rng, SIG_001_TEXTS),
        tags: [...CLUSTER_TAGS["SIG-001"]],
      }),
    );
  }

  const sig002Count = 45;
  const adhesionPool = adhesionRows.length > 0 ? adhesionRows : anyRows;
  for (let i = 0; i < sig002Count; i++) {
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row: pickRow(rng, adhesionPool),
        text: choice(rng, SIG_002_TEXTS),
        tags: [...CLUSTER_TAGS["SIG-002"]],
      }),
    );
  }

  const sig003DeviceIds: string[] = [];
  for (let i = 0; i < SIG_003_TICKET_COUNT; i++) {
    const row = pickRow(rng, anyRows.filter((r) => inCurrentWindow(r.date)));
    sig003DeviceIds.push(row.device_id);
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row,
        text: choice(rng, SIG_003_TEXTS),
        tags: [...CLUSTER_TAGS["SIG-003"]],
      }),
    );
  }

  const sig004Count = 50;
  for (let i = 0; i < sig004Count; i++) {
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row: pickRow(rng, nordicsRows),
        text: choice(rng, SIG_004_TEXTS),
        tags: [...CLUSTER_TAGS["SIG-004"]],
      }),
    );
  }

  const benignClaimsCount = 5;
  for (let i = 0; i < benignClaimsCount; i++) {
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row: pickRow(rng, anyRows),
        text: choice(rng, BENIGN_CLAIMS_TEXTS),
        tags: ["claims-interpretation"],
      }),
    );
  }

  const outsideOnce: SupportTag[][] = [
    ["connectivity"],
    ["app-sync"],
    ["adhesion"],
    ["skin-irritation"],
    ["comfort-fit"],
    ["data-accuracy"],
    ["battery"],
    ["overheating"],
    ["app-ui"],
    ["data-privacy"],
    ["packaging"],
  ];
  for (const tags of outsideOnce) {
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row: pickRow(rng, anyRows),
        text: choice(rng, NOISE_TEXTS),
        tags,
      }),
    );
  }

  while (nextFb < FEEDBACK_COUNT) {
    const extraTags: SupportTag[] = [
      "data-privacy",
      "packaging",
      "app-ui",
      "comfort-fit",
      "battery",
      "connectivity",
      "app-sync",
      "data-accuracy",
    ];
    feedback.push(
      makeFeedback({
        rng,
        index: nextFb++,
        row: pickRow(rng, anyRows),
        text: choice(rng, NOISE_TEXTS),
        tags: [choice(rng, extraTags)],
      }),
    );
  }

  feedback.sort((a, b) => a.id.localeCompare(b.id));

  const clusterFeedback = {
    "SIG-001": feedback.slice(0, sig001Count),
    "SIG-002": feedback.slice(sig001Count, sig001Count + sig002Count),
    "SIG-003": feedback.slice(
      sig001Count + sig002Count,
      sig001Count + sig002Count + SIG_003_TICKET_COUNT,
    ),
    "SIG-004": feedback.slice(
      sig001Count + sig002Count + SIG_003_TICKET_COUNT,
      sig001Count + sig002Count + SIG_003_TICKET_COUNT + sig004Count,
    ),
  };

  const sig002Devices = currentWindowDeviceIds(clusterFeedback["SIG-002"]);
  const sig003Devices = currentWindowDeviceIds(clusterFeedback["SIG-003"]);
  const sig004Devices = currentWindowDeviceIds(clusterFeedback["SIG-004"]);

  const signals = {
    signals: [
      {
        id: "SIG-001" as const,
        is_real: true,
        authorial_severity: "HIGH" as const,
        claims_risk: false,
        feedback_ids: clusterFeedback["SIG-001"].map((row) => row.id),
        device_ids: sig001Devices,
      },
      {
        id: "SIG-002" as const,
        is_real: true,
        authorial_severity: "MEDIUM" as const,
        claims_risk: false,
        feedback_ids: clusterFeedback["SIG-002"].map((row) => row.id),
        device_ids: sig002Devices,
      },
      {
        id: "SIG-003" as const,
        is_real: true,
        authorial_severity: null,
        claims_risk: true,
        feedback_ids: clusterFeedback["SIG-003"].map((row) => row.id),
        device_ids: sig003Devices,
      },
      {
        id: "SIG-004" as const,
        is_real: false,
        authorial_severity: null,
        claims_risk: false,
        feedback_ids: clusterFeedback["SIG-004"].map((row) => row.id),
        device_ids: sig004Devices,
      },
    ],
  };

  devices.sort((a, b) => a.device_id.localeCompare(b.device_id));

  return { devices, telemetry, feedback, taxonomy, signals };
}

export function serializeFixtureJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
