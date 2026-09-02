import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src", "app");
const GLOBALS = join(ROOT, "globals.css");
const LAYOUT = join(ROOT, "layout.tsx");

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

const REQUIRED_TOKENS: Record<string, string> = {
  "--bg-canvas": "#ffffff",
  "--bg-subtle": "#f4f5f8",
  "--bg-card": "#ffffff",
  "--border-default": "#e5e5e6",
  "--border-strong": "#d0d3d9",
  "--text-primary": "#282a30",
  "--text-secondary": "#3c4149",
  "--text-tertiary": "#6b6f76",
  "--text-muted": "#8a8f98",
  "--accent": "#5e6ad2",
  "--accent-hover": "#6e7ae2",
  "--accent-active": "#4e5ac2",
  "--success": "#27a644",
  "--warning": "#f2c94c",
  "--danger": "#eb5757",
  "--info": "#02b8cc",
};

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function rootBlock(css: string): string {
  const match = css.match(/:root\s*\{[\s\S]*?\n\}/);
  if (!match) throw new Error(":root block missing");
  return match[0];
}

function srgbChannel(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const n =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("CR-002 token layer", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const layout = readFileSync(LAYOUT, "utf8");
  const root = rootBlock(css);

  it("pins the light palette hex values in :root only", () => {
    for (const [name, hex] of Object.entries(REQUIRED_TOKENS)) {
      expect(root, name).toContain(`${name}: ${hex}`);
    }
  });

  it("bans hard-coded hex outside the :root token block", () => {
    expect(root.match(HEX)?.length).toBeGreaterThan(0);
    const start = css.indexOf(":root");
    const open = css.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const outsideRoot = css.slice(0, start) + css.slice(end + 1);
    expect(outsideRoot.match(HEX) ?? []).toEqual([]);

    const leaks: string[] = [];
    for (const file of walk(ROOT)) {
      if (file === GLOBALS || file.endsWith(".test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const hex of text.match(HEX) ?? []) {
        leaks.push(`${file.replace(`${process.cwd()}/`, "")}: ${hex}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("meets AA contrast on canvas for body and large/secondary text", () => {
    const canvas = REQUIRED_TOKENS["--bg-canvas"];
    expect(contrast(REQUIRED_TOKENS["--text-primary"], canvas)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(REQUIRED_TOKENS["--text-secondary"], canvas),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(REQUIRED_TOKENS["--text-tertiary"], canvas),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(REQUIRED_TOKENS["--text-muted"], canvas)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("loads Inter through next/font and sets OpenType features in CSS", () => {
    expect(layout).toContain('from "next/font/google"');
    expect(layout).toMatch(/Inter\s*\(/);
    expect(layout).not.toContain("Geist");
    expect(css).toMatch(/font-feature-settings:\s*"cv01"\s+1,\s*"ss03"\s+1,\s*"zero"\s+1/);
    expect(css).toContain('"Inter Variable"');
    expect(css).toContain("ui-monospace, SFMono-Regular, Menlo, Consolas, monospace");
  });

  it("never sets a font-weight above 600", () => {
    const weights = [...css.matchAll(/font-weight:\s*var\(--font-weight-[^)]+\)|font-weight:\s*(\d+)/g)];
    expect(css).toContain("--font-weight-reading: 400");
    expect(css).toContain("--font-weight-ui: 510");
    expect(css).toContain("--font-weight-strong: 590");
    for (const match of weights) {
      if (match[1]) expect(Number(match[1])).toBeLessThanOrEqual(600);
    }
  });

  it("shadows only the drawer", () => {
    expect(css).toContain("--shadow-drawer: 0 4px 24px rgba(0, 0, 0, 0.1)");
    expect(css).toMatch(/\.ticket-drawer[\s\S]*box-shadow:\s*var\(--shadow-drawer\)/);
    expect(css).not.toMatch(/\.ticket-card[\s\S]{0,200}box-shadow/);
  });
});
