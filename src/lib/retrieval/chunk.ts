import type { Chunk } from "./types";

export const BODY_SPLIT_CHARS = 800;

const DOC_ID_RE = /^(KD-\d+)/;

export function docIdFromFilename(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const match = DOC_ID_RE.exec(base);
  if (!match) {
    throw new Error(`cannot derive doc_id from filename: ${filename}`);
  }
  return match[1];
}

function slug(section: string): string {
  const s = section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s : "section";
}

function splitWords(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const parts: string[] = [];
  let buf = "";
  for (const word of words) {
    const candidate = buf ? `${buf} ${word}` : word;
    if (candidate.length <= max) {
      buf = candidate;
    } else {
      if (buf) parts.push(buf);
      buf = word.length <= max ? word : word.slice(0, max);
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

/** Split a heading body on blank lines (then words) so each piece is ≤ max chars. */
export function splitBody(body: string, max = BODY_SPLIT_CHARS): string[] {
  const trimmed = body.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= max) return [trimmed];

  const paras = trimmed.split(/\n\s*\n/);
  const pieces: string[] = [];
  let buf = "";
  for (const para of paras) {
    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length <= max) {
      buf = candidate;
    } else {
      if (buf) pieces.push(buf);
      if (para.length <= max) {
        buf = para;
      } else {
        pieces.push(...splitWords(para, max));
        buf = "";
      }
    }
  }
  if (buf) pieces.push(buf);
  return pieces;
}

type OpenSection = {
  section: string;
  lines: string[];
};

function flush(
  open: OpenSection | null,
  acc: { section: string; body: string }[],
): void {
  if (!open) return;
  const body = open.lines.join("\n").trim();
  if (body.length === 0) return;
  acc.push({ section: open.section, body });
}

/**
 * Chunk a markdown knowledge document by `##` / `###` headings.
 * The first `#` heading is the document title. Preamble under the title
 * is kept as its own section (the title string).
 */
export function chunkMarkdown(filename: string, markdown: string): Chunk[] {
  const doc_id = docIdFromFilename(filename);
  const lines = markdown.split(/\r?\n/);

  let title = doc_id;
  let seenH1 = false;
  let open: OpenSection | null = null;
  const blocks: { section: string; body: string }[] = [];

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (!heading) {
      if (!open) {
        open = { section: title, lines: [] };
      }
      open.lines.push(line);
      continue;
    }

    const level = heading[1].length;
    const text = heading[2];

    if (level === 1 && !seenH1) {
      flush(open, blocks);
      title = text;
      seenH1 = true;
      open = { section: title, lines: [] };
      continue;
    }

    flush(open, blocks);
    open = { section: text, lines: [] };
  }
  flush(open, blocks);

  const slugCount = new Map<string, number>();
  const chunks: Chunk[] = [];

  for (const block of blocks) {
    const pieces = splitBody(block.body);
    const sectionSlug = slug(block.section);
    for (const piece of pieces) {
      const n = (slugCount.get(sectionSlug) ?? 0) + 1;
      slugCount.set(sectionSlug, n);
      chunks.push({
        chunk_id: `${doc_id}#${sectionSlug}#${n}`,
        doc_id,
        title,
        section: block.section,
        text: `${block.section}\n\n${piece}`,
      });
    }
  }

  return chunks;
}
