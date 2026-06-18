// Hymn library schema and I/O helpers.
//
// HymnLibrary is the structured output of the PPTX importer: a collection
// of hymns with per-slide lyric content extracted from Hymns.pptx. Downstream
// stages (plan expander, slide renderer) read this file to turn a ServicePlan
// song reference into rendered lyric slides.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeTitle } from "./hymn-match";

export type HymnSlideContent = {
  // Best-effort tag, e.g. "verse-1", "chorus", "bridge", or "unknown".
  // Heuristic only — Stage 4 will let the user re-tag in the library UI.
  tag: string;
  // The lyric lines for this block, in order.
  lines: string[];
  // Forces a rendered-slide boundary before this block. The expander packs
  // consecutive blocks onto one slide by height; a block marked
  // startNewSlide always begins a fresh slide regardless of remaining space.
  // (The first block always starts a slide, so the flag is a no-op there.)
  startNewSlide?: boolean;
};

export type Hymn = {
  // slug of title, lowercase, kebab-case, e.g. "everlasting-god"
  id: string;
  title: string;
  // Comma-separated authors as in the bulletin, e.g. "Brown, Riley"
  authors?: string;
  // Free-form multi-line copyright/CCLI block rendered verbatim at the
  // bottom of every slide for this hymn. Use "\n" to separate lines.
  // Example: "©2005 Thankyou Music\nCCLI License No. 236495"
  copyright?: string;
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

export function findHymnByTitle(lib: HymnLibrary, title: string): Hymn | undefined {
  const needle = normalizeTitle(title);
  return lib.songs.find((h) => normalizeTitle(h.title) === needle);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function upsertHymn(lib: HymnLibrary, hymn: Hymn): HymnLibrary {
  const stored: Hymn = { ...hymn, id: slugify(hymn.title) };
  const needle = normalizeTitle(hymn.title);
  const idx = lib.songs.findIndex((h) => normalizeTitle(h.title) === needle);
  if (idx === -1) {
    return { songs: [...lib.songs, stored] };
  }
  const songs = [...lib.songs];
  songs[idx] = stored;
  return { songs };
}

export function deleteHymnByTitle(
  lib: HymnLibrary,
  title: string
): { library: HymnLibrary; removed: boolean } {
  const needle = normalizeTitle(title);
  const idx = lib.songs.findIndex((h) => normalizeTitle(h.title) === needle);
  if (idx === -1) {
    return { library: lib, removed: false };
  }
  const songs = [...lib.songs];
  songs.splice(idx, 1);
  return { library: { songs }, removed: true };
}
