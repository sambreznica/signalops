import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateFixtures, serializeFixtureJson } from "../src/lib/fixtures/generate";

const outDir = path.resolve(process.cwd(), "synthetic-data");
mkdirSync(outDir, { recursive: true });

const bundle = generateFixtures();

const files: Record<string, unknown> = {
  "devices.json": bundle.devices,
  "telemetry.json": bundle.telemetry,
  "feedback.json": bundle.feedback,
  "tag-taxonomy.json": bundle.taxonomy,
  "signals.json": bundle.signals,
};

for (const [name, value] of Object.entries(files)) {
  writeFileSync(path.join(outDir, name), serializeFixtureJson(value));
}

console.log(
  `Wrote ${bundle.devices.length} devices, ${bundle.telemetry.length} telemetry, ${bundle.feedback.length} feedback to synthetic-data/`,
);
