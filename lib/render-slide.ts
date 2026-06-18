/**
 * Slide renderer — converts a Slide (any kind) to a PNG Buffer.
 * Uses satori for SVG generation and @resvg/resvg-js for rasterization.
 *
 * Stage 1 HymnVerseSlide is kept as a back-compat re-export.
 */

import fs from "fs";
import path from "path";
import satori, { type Font as SatoriFont } from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { Theme } from "./themes/types";
import { defaultTheme } from "./themes/default/index";

// ---------------------------------------------------------------------------
// Public slide type union
// ---------------------------------------------------------------------------

export type LiturgyLine = { speaker: "P" | "C" | "A" | "L"; text: string };

/**
 * One labeled lyric block on a hymn slide — a tag ("v1", "chorus") above its
 * lyric lines. A hymn slide stacks one or more of these (e.g. a verse and its
 * refrain on the same slide), matching the reference deck.
 */
export type HymnBlock = { tag?: string; lines: string[] };

export type Slide =
  | { kind: "liturgy"; items: LiturgyLine[]; title?: string; citation?: string }
  | { kind: "reading"; title: string; citation: string; responseA: string; responseC: string }
  | { kind: "hymn"; title: string; hymnNumber?: string; blocks: HymnBlock[]; copyright?: string };

// ---------------------------------------------------------------------------
// Back-compat alias for Stage 1 consumers (build-bundle imports this)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `Slide` with `kind: "hymn"` instead.
 */
export type HymnVerseSlide = {
  kind: "hymn-verse";
  hymnTitle: string;
  hymnNumber?: string;
  verseNumber: number;
  lines: string[];
};

// ---------------------------------------------------------------------------
// Font loading — resolved once, reused across calls in the same process.
// ---------------------------------------------------------------------------

const FONT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "fonts");

let _interData: Buffer | undefined;
let _lsbData: Buffer | undefined;
let _lsbLoadFailed = false;
let _ssProRegular: Buffer | undefined;
let _ssProItalic: Buffer | undefined;
let _ssProBold: Buffer | undefined;

function loadInter(): Buffer {
  if (!_interData) {
    _interData = fs.readFileSync(path.join(FONT_DIR, "Inter-Regular.woff"));
  }
  return _interData;
}

function tryLoadLSB(): Buffer | null {
  if (_lsbLoadFailed) return null;
  if (_lsbData) return _lsbData;
  try {
    _lsbData = fs.readFileSync(path.join(FONT_DIR, "LSBSymbol.ttf"));
    return _lsbData;
  } catch (err) {
    console.warn("[render-slide] LSBSymbol.ttf failed to load:", err);
    _lsbLoadFailed = true;
    return null;
  }
}

function loadSourceSerifPro(): { regular: Buffer; italic: Buffer; bold: Buffer } {
  if (!_ssProRegular) {
    _ssProRegular = fs.readFileSync(path.join(FONT_DIR, "SourceSerifPro-Regular.woff"));
  }
  if (!_ssProItalic) {
    _ssProItalic = fs.readFileSync(path.join(FONT_DIR, "SourceSerifPro-Italic.woff"));
  }
  if (!_ssProBold) {
    _ssProBold = fs.readFileSync(path.join(FONT_DIR, "SourceSerifPro-Bold.woff"));
  }
  return { regular: _ssProRegular, italic: _ssProItalic, bold: _ssProBold };
}

// ---------------------------------------------------------------------------
// Adapter: HymnVerseSlide → Slide (for back-compat)
// ---------------------------------------------------------------------------

function adaptHymnVerse(s: HymnVerseSlide): Extract<Slide, { kind: "hymn" }> {
  return {
    kind: "hymn",
    title: s.hymnTitle,
    hymnNumber: s.hymnNumber,
    blocks: [{ tag: `verse ${s.verseNumber}`, lines: s.lines }],
  };
}

// ---------------------------------------------------------------------------
// renderSlide — main entry point
// ---------------------------------------------------------------------------

export async function renderSlide(
  slide: Slide | HymnVerseSlide,
  theme?: Theme
): Promise<Buffer> {
  const resolvedTheme = theme ?? defaultTheme;

  // Normalize HymnVerseSlide → Slide
  const normalized: Slide =
    slide.kind === "hymn-verse" ? adaptHymnVerse(slide) : (slide as Slide);

  // Dispatch to theme renderer — each renderer returns { jsx, width, height }
  let jsx: unknown;
  let width: number;
  let height: number;

  switch (normalized.kind) {
    case "liturgy": {
      const result = resolvedTheme.renderers.liturgy(normalized);
      jsx = result.jsx;
      width = result.width;
      height = result.height;
      break;
    }
    case "reading": {
      const result = resolvedTheme.renderers.reading(normalized);
      jsx = result.jsx;
      width = result.width;
      height = result.height;
      break;
    }
    case "hymn": {
      const result = resolvedTheme.renderers.hymn(normalized);
      jsx = result.jsx;
      width = result.width;
      height = result.height;
      break;
    }
    default: {
      const _never: never = normalized;
      throw new Error(`Unknown slide kind: ${JSON.stringify(_never)}`);
    }
  }

  // Build font list
  const interData = loadInter();
  const lsbData = tryLoadLSB();
  const ssp = loadSourceSerifPro();

  const fonts: SatoriFont[] = [
    { name: "Inter", data: interData, weight: 400, style: "normal" },
    { name: "Source Serif Pro", data: ssp.regular, weight: 400, style: "normal" },
    { name: "Source Serif Pro", data: ssp.italic, weight: 400, style: "italic" },
    { name: "Source Serif Pro", data: ssp.bold, weight: 700, style: "normal" },
  ];

  if (lsbData) {
    fonts.push({ name: "LSBSymbol", data: lsbData, weight: 400, style: "normal" });
  } else {
    console.warn(
      "[render-slide] LSBSymbol unavailable — liturgy speaker glyphs will fall back to Inter bold"
    );
  }

  const svg = await satori(jsx as Parameters<typeof satori>[0], {
    width,
    height,
    fonts,
  });

  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false },
    fitTo: { mode: "original" },
  });

  return resvg.render().asPng();
}
