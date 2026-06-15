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
};

type RawTextItem = {
  str: string;
  transform: number[];
  width: number;
};

const Y_CLUSTER_TOLERANCE = 2.5;
// A whitespace item whose width exceeds this threshold is a column separator
// (used for "Song  Title  Authors" padding-space alignment in bulletins).
const COLUMN_SEPARATOR_WIDTH = 30;
// Left margin of the bulletin in PDF units.
const LEFT_MARGIN = 36;
// PDF units per "indent level". x=36 → 0 spaces, x=45 → 1, x=63 → 3, etc.
const BASE_COL_WIDTH = 9;

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
    const clusters: { y: number; items: { x: number; str: string; width: number }[] }[] = [];

    for (const raw of tc.items) {
      const item = raw as RawTextItem;
      if (!("str" in item)) continue;
      const y = item.transform[5];
      const x = item.transform[4];
      const width = item.width;

      let cluster = clusters.find((c) => Math.abs(c.y - y) < Y_CLUSTER_TOLERANCE);
      if (!cluster) {
        cluster = { y, items: [] };
        clusters.push(cluster);
      }
      cluster.items.push({ x, str: item.str, width });
    }

    // Sort clusters top-to-bottom (larger Y = higher on page in PDF coords)
    clusters.sort((a, b) => b.y - a.y);

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

        // Normal text item
        if (currentColX < 0) {
          currentColX = it.x;
        }
        currentColText += it.str;
      }

      if (currentColText.trim()) {
        columns.push([currentColX, currentColText.trimEnd()]);
      }

      if (columns.length === 0) continue;

      // Full text is all columns joined with two spaces
      const text = columns.map(([, t]) => t).join("  ");

      const minX = columns[0][0];
      const leadingSpaces = Math.max(0, Math.round((minX - LEFT_MARGIN) / BASE_COL_WIDTH));

      allLines.push({
        page: pageNum,
        y: cluster.y,
        leadingSpaces,
        text,
        minX,
        columns,
      });
    }
  }

  return allLines;
}
