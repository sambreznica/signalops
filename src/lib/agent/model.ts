import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is unset. Set it in the environment (see .env.example). There is no default.`,
    );
  }
  return value.trim();
}

export function requireAnthropicModel(): string {
  return requireEnv("ANTHROPIC_MODEL");
}

export function requireAnthropicApiKey(): string {
  return requireEnv("ANTHROPIC_API_KEY");
}

/** Load `.env` then `.env.local` without overriding existing process.env. */
export function loadEnvFiles(root: string): void {
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
