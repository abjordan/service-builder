// PDF layout reconstruction pass.
// Uses pdfjs-dist to extract positioned text items, then groups them into
// logical lines sorted top-to-bottom, left-to-right.

export type LayoutLine = {
  page: number;
  y: number;
  leadingSpaces: number;
  text: string;
  minX: number; // raw X value of the leftmost item
  // Column segments: when a line has multiple tab-separated columns, they are
  // split here. Each entry is [x, text].
  columns: [number, string][];
  // Font name of the first non-whitespace body item (x past the left margin).
  // Used downstream to distinguish weights within a section — the Psalm parser
  // uses it to tell pastor verses from congregation verses by sampling the
  // body font of a known-C-marked line.
  fontName: string;
};

type RawTextItem = {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
};

const Y_CLUSTER_TOLERANCE = 2.5;
// A whitespace item whose width exceeds this threshold is a column separator
// (used for "Song  Title  Authors" padding-space alignment in bulletins).
const COLUMN_SEPARATOR_WIDTH = 30;
// Left margin of the bulletin in PDF units.
const LEFT_MARGIN = 36;
// PDF units per "indent level". x=36 → 0 spaces, x=45 → 1, x=63 → 3, etc.
const BASE_COL_WIDTH = 9;

// X range for speaker-prefix glyphs (P/C/A/L) in the bulletin.
const SPEAKER_PREFIX_X_MIN = 40;
const SPEAKER_PREFIX_X_MAX = 50;

// Detect the LSBSymbol font name for a page by finding the speaker-prefix
// items (P/C/A/L at x≈45). Returns empty string if none found.
function detectLsbFontName(
  items: { x: number; str: string; fontName: string }[]
): string {
  for (const it of items) {
    if (
      /^[PCAL]$/.test(it.str.trim()) &&
      it.x >= SPEAKER_PREFIX_X_MIN &&
      it.x <= SPEAKER_PREFIX_X_MAX
    ) {
      return it.fontName;
    }
  }
  return "";
}

export async function extractLayoutLines(
  // Accept any object with the pdfjs page API shape so we don't import the
  // pdfjs types directly (avoids pulling in its DOM type declarations).
  pdf: {
    numPages: number;
    getPage: (n: number) => Promise<{
      getTextContent: (opts: { includeMarkedContent: boolean }) => Promise<{
        items: unknown[];
      }>;
    }>;
  }
): Promise<LayoutLine[]> {
  const allLines: LayoutLine[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent({ includeMarkedContent: false });

    // Cluster items into lines by Y position
    const clusters: {
      y: number;
      items: { x: number; str: string; width: number; fontName: string }[];
    }[] = [];

    for (const raw of tc.items) {
      const item = raw as RawTextItem;
      if (!("str" in item)) continue;
      const y = item.transform[5];
      const x = item.transform[4];
      const width = item.width;
      const fontName = item.fontName ?? "";

      let cluster = clusters.find((c) => Math.abs(c.y - y) < Y_CLUSTER_TOLERANCE);
      if (!cluster) {
        cluster = { y, items: [] };
        clusters.push(cluster);
      }
      cluster.items.push({ x, str: item.str, width, fontName });
    }

    // Sort clusters top-to-bottom (larger Y = higher on page in PDF coords)
    clusters.sort((a, b) => b.y - a.y);

    // Identify the LSBSymbol font name for this page by sampling speaker-prefix
    // items. This is used to detect inline LSB glyphs within body text.
    const allPageItems = clusters.flatMap((c) => c.items);
    const lsbFontName = detectLsbFontName(allPageItems);

    for (const cluster of clusters) {
      // Sort items left to right within line
      cluster.items.sort((a, b) => a.x - b.x);

      // Determine column breaks. The bulletin uses large-width space items as
      // padding between tab-aligned columns (e.g. "Song", "Title", "Authors").
      // A whitespace-only item with width > COLUMN_SEPARATOR_WIDTH marks a break.
      const columns: [number, string][] = [];
      let currentColX = -1;
      let currentColText = "";

      for (const it of cluster.items) {
        const isWhitespace = it.str.trim() === "";
        const isColumnSep = isWhitespace && it.width > COLUMN_SEPARATOR_WIDTH;

        if (isColumnSep) {
          // Flush current column and start a new one at the end of this separator
          if (currentColText.trim()) {
            columns.push([currentColX, currentColText.trimEnd()]);
          }
          currentColX = it.x + it.width; // next column starts after the separator
          currentColText = "";
          continue;
        }

        if (isWhitespace) {
          // Small whitespace: append only if we already have content
          if (currentColText.trim()) currentColText += it.str;
          continue;
        }

        // Inline LSB glyph: same font as speaker prefixes, but not in the
        // prefix position — wrap in a marker so the theme can render it in
        // LSBSymbol font. Speaker prefix items (x≈45) are left as raw text
        // so the parser's speaker-detection logic continues to work.
        const isInlineLsb =
          lsbFontName !== "" &&
          it.fontName === lsbFontName &&
          it.str.trim() !== "" &&
          !(it.x >= SPEAKER_PREFIX_X_MIN && it.x <= SPEAKER_PREFIX_X_MAX);

        // Normal text item
        if (currentColX < 0) {
          currentColX = it.x;
        }
        currentColText += isInlineLsb ? `{{lsb:${it.str}}}` : it.str;
      }

      if (currentColText.trim()) {
        columns.push([currentColX, currentColText.trimEnd()]);
      }

      if (columns.length === 0) continue;

      // Full text is all columns joined with two spaces
      const text = columns.map(([, t]) => t).join("  ");

      const minX = columns[0][0];
      const leadingSpaces = Math.max(0, Math.round((minX - LEFT_MARGIN) / BASE_COL_WIDTH));

      // Pick the body fontName: first non-whitespace item whose x is past the
      // left margin (skip speaker glyph markers like "P"/"C" sitting at x≈45
      // which use a different font than the line's body text).
      const bodyItem = cluster.items.find(
        (it) => it.str.trim() !== "" && it.x > LEFT_MARGIN + 20,
      );
      const firstTextItem = cluster.items.find((it) => it.str.trim() !== "");
      const fontName = bodyItem?.fontName ?? firstTextItem?.fontName ?? "";

      allLines.push({
        page: pageNum,
        y: cluster.y,
        leadingSpaces,
        text,
        minX,
        columns,
        fontName,
      });
    }
  }

  return allLines;
}
