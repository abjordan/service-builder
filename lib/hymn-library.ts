// Hymn library schema and I/O helpers.
//
// HymnLibrary is the structured output of the PPTX importer: a collection
// of hymns with per-slide lyric content extracted from Hymns.pptx. Downstream
// stages (plan expander, slide renderer) read this file to turn a ServicePlan
// song reference into rendered lyric slides.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type HymnSlideContent = {
  // Best-effort tag, e.g. "verse-1", "chorus", "bridge", or "unknown".
  // Heuristic only — Stage 4 will let the user re-tag in the library UI.
  tag: string;
  // The lyric lines for this slide, in order.
  lines: string[];
};

export type Hymn = {
  // slug of title, lowercase, kebab-case, e.g. "everlasting-god"
  id: string;
  title: string;
  // Comma-separated authors as in the bulletin, e.g. "Brown, Riley"
  authors?: string;
  // Each entry is one slide as it appeared in Hymns.pptx, in order.
  // Stage 3's plan expander reads this raw ordered list and emits one
  // rendered slide per entry. The verse/chorus distinction is preserved
  // as a hint but not enforced — the play order is the slide order.
  slides: HymnSlideContent[];
};

export type HymnLibrary = {
  songs: Hymn[];
};

const DEFAULT_PATH = "data/hymns.json";

// Read & write helpers. Default path is data/hymns.json (relative to cwd).

export function readLibrary(path?: string): HymnLibrary {
  const filePath = path ?? DEFAULT_PATH;
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as HymnLibrary;
}

export function writeLibrary(lib: HymnLibrary, path?: string): void {
  const filePath = path ?? DEFAULT_PATH;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(lib, null, 2) + "\n", "utf-8");
}

/** Fuzzy match: normalize both sides (lowercase, strip punctuation, collapse whitespace). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findHymnByTitle(lib: HymnLibrary, title: string): Hymn | undefined {
  const needle = normalize(title);
  return lib.songs.find((h) => normalize(h.title) === needle);
}
