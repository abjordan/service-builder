// Bulletin PDF parser.
//
// Converts a church bulletin PDF (as a Buffer or Uint8Array) into a structured
// ServicePlan. Uses pdfjs-dist for in-process PDF text extraction — no shell
// commands, no network calls, no filesystem writes.

import type {
  ParseResult,
  ParseWarning,
  ServicePlan,
  ServicePlanMetadata,
  Section,
  LiturgyBlock,
  LiturgyItem,
  Speaker,
  Song,
  Reading,
  SectionHeader,
  Note,
} from "./service-plan";
import { extractLayoutLines, type LayoutLine } from "./pdf-layout";

// ---------------------------------------------------------------------------
// Known section headings (exact match after trim)
// ---------------------------------------------------------------------------
const SECTION_HEADINGS = new Set([
  "Introit",
  "Welcome",
  "Confession and Absolution",
  "Service of the Word",
  "Psalm",
  "Salutation and Collect of the Day",
  "Old Testament Reading",
  "Epistle",
  "Holy Gospel",
  "Nicene Creed",
  "Sermon",
  "Prayer of the Church",
  "Lord's Prayer",
  "Benediction",
  "Acknowledgments",
  "Resources for Meditation this Week",
  "Communion Theology and Practice",
  "Song",
]);

const READING_HEADINGS = new Set([
  "Old Testament Reading",
  "Epistle",
  "Holy Gospel",
]);

// Headings that become plain SectionHeaders (no child liturgy items)
const PURE_HEADER_HEADINGS = new Set([
  "Service of the Word",
  "Sermon",
]);

// Headings whose body becomes a single Note
const NOTE_HEADINGS = new Set([
  "Acknowledgments",
  "Resources for Meditation this Week",
  "Communion Theology and Practice",
]);

// Headings that carry an LSB number (right-hand column)
const LSB_HEADINGS = new Set(["Nicene Creed"]);

// Headings whose section defaults to includeInSlides=false. House rule for the
// LCS livestream: Introit is read before the broadcast goes live; the three
// note sections are bulletin-only content.
const SLIDES_EXCLUDED_BY_DEFAULT = new Set([
  "Introit",
  "Acknowledgments",
  "Resources for Meditation this Week",
  "Communion Theology and Practice",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSpeakerPrefix(ch: string): ch is Speaker {
  return ch === "P" || ch === "C" || ch === "A" || ch === "L";
}

// Returns { speaker, text } if the line starts with a speaker prefix, else null.
function parseSpeakerLine(line: LayoutLine): { speaker: Speaker; text: string } | null {
  const t = line.text;
  // Speaker pattern: optional leading spaces, then P/C/A/L followed by a space
  const firstCol = line.columns[0];
  if (!firstCol) return null;
  const colText = firstCol[1].trimStart();
  if (colText.length >= 3 && isSpeakerPrefix(colText[0]) && colText[1] === " ") {
    return { speaker: colText[0] as Speaker, text: colText.slice(2).trim() };
  }
  // Also check the raw text (in case columns merged)
  const trimmed = t.trimStart();
  if (trimmed.length >= 3 && isSpeakerPrefix(trimmed[0]) && trimmed[1] === " ") {
    return { speaker: trimmed[0] as Speaker, text: trimmed.slice(2).trim() };
  }
  return null;
}

// Matches a section heading. Returns { heading, rightText } or null.
function matchHeading(line: LayoutLine): { heading: string; rightText: string } | null {
  // First column text is the potential heading
  const firstColText = line.columns[0]?.[1] ?? "";
  const trimmed = firstColText.trim();
  if (SECTION_HEADINGS.has(trimmed)) {
    // Right-hand text is from the second column onward
    const rightText = line.columns
      .slice(1)
      .map(([, t]) => t)
      .join("  ")
      .trim();
    return { heading: trimmed, rightText };
  }
  return null;
}

// Whether a line is a continuation of the previous speaker line.
// Continuation: no speaker prefix, indented more than the section heading margin.
function isContinuation(line: LayoutLine, prevSpeakerX: number): boolean {
  // Continuation lines are indented beyond the speaker's text start
  return parseSpeakerLine(line) === null && matchHeading(line) === null && line.minX > prevSpeakerX;
}

function isNumericOnly(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

// Parse "June 14, 2026" → "2026-06-14"
function parseDate(s: string): string | null {
  const months: Record<string, string> = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12",
  };
  const m = s.match(/(\w+)\s+(\d+),\s+(\d{4})/);
  if (!m) return null;
  const [, month, day, year] = m;
  const mm = months[month];
  if (!mm) return null;
  return `${year}-${mm}-${day.padStart(2, "0")}`;
}

// Title-case a string.
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function parseBulletin(pdf: Buffer | Uint8Array): Promise<ParseResult> {
  // Dynamically import pdfjs-dist legacy build to keep this module compatible
  // with Next.js (avoids worker complications at build time).
  const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
  const pdfjsLib = (pdfjsModule.default ?? pdfjsModule) as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (opts: { data: Uint8Array }) => { promise: Promise<unknown> };
  };

  // Point the worker at the sibling worker file so pdfjs can spawn it.
  // Using a file:// URL works in Node; in browser contexts Next.js would
  // need its own webpack config — but for our server-side use case this is fine.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  }

  const data = pdf instanceof Buffer ? new Uint8Array(pdf) : pdf;
  const pdfDoc = await (pdfjsLib.getDocument({ data }) as { promise: Promise<Parameters<typeof extractLayoutLines>[0]> }).promise;

  const lines = await extractLayoutLines(pdfDoc);
  const warnings: ParseWarning[] = [];

  // -------------------------------------------------------------------------
  // Pass 1: Extract metadata from the header pages
  // -------------------------------------------------------------------------
  const metadata = extractMetadata(lines, warnings);

  // -------------------------------------------------------------------------
  // Pass 2: Parse the service body into sections
  // -------------------------------------------------------------------------
  const sections = parseSections(lines, warnings);

  // -------------------------------------------------------------------------
  // Pass 3: Detect liturgicalDay from "Resources for Meditation" block
  // -------------------------------------------------------------------------
  if (!metadata.liturgicalDay) {
    const fullText = lines.map((l) => l.text).join("\n");
    const dayMatch = fullText.match(
      /\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|LAST|THE\s+LAST)\s+SUNDAY\s+(AFTER|OF|IN|BEFORE)\s+[A-Z]+/i
    );
    if (dayMatch) {
      metadata.liturgicalDay = toTitleCase(dayMatch[0]);
    } else {
      const trinityMatch = fullText.match(/SUNDAY\s+OF\s+THE\s+HOLY\s+TRINITY/i);
      if (trinityMatch) {
        metadata.liturgicalDay = toTitleCase(trinityMatch[0]);
      } else {
        warnings.push({
          message: "Could not detect liturgicalDay from bulletin text",
          severity: "warn",
        });
      }
    }
  }

  const plan: ServicePlan = { metadata, sections };
  return { plan, warnings };
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

function extractMetadata(lines: LayoutLine[], _warnings: ParseWarning[]): ServicePlanMetadata {
  // Gather text from both cover pages (pages 1-3 tend to have metadata)
  const headerLines = lines.filter((l) => l.page <= 3);
  const headerText = headerLines.map((l) => l.text).join("\n");

  // Church name: "The Lutheran Church of the Savior"
  const churchNameMatch = headerText.match(/The Lutheran Church of the Savior/);
  const churchName = churchNameMatch ? "The Lutheran Church of the Savior" : "";

  // Date and time appear together: "June 14, 2026 10:45 AM" (on same line)
  let serviceDate = "";
  let serviceTime: string | undefined;
  for (const line of headerLines) {
    const dateMatch = line.text.match(/(\w+ \d+, \d{4})/);
    if (dateMatch) {
      const parsed = parseDate(dateMatch[1]);
      if (parsed) serviceDate = parsed;
    }
    const timeMatch = line.text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/);
    if (timeMatch) {
      serviceTime = timeMatch[1].trim();
    }
  }

  // Address: "426 Davis Road - Bedford, MA 01730"
  const addressMatch = headerText.match(/(\d+\s+[A-Z][^–\n]+(?:Road|St|Ave|Blvd|Drive|Dr|Way|Lane|Ln)\s*-[^\n]+)/i);
  const address = addressMatch ? addressMatch[1].trim() : undefined;

  // Web: URL
  const webMatch = headerText.match(/https?:\/\/[^\s]+/);
  const web = webMatch ? webMatch[0].trim() : undefined;

  // Phone: 781-275-6013
  const phoneMatch = headerText.match(/(\d{3}-\d{3}-\d{4})/);
  const phone = phoneMatch ? phoneMatch[1] : undefined;

  // Pastor: "Rev. Nils Niemeier, Pastor"
  const pastorMatch = headerText.match(/Rev\.\s+([^,\n]+),\s*Pastor/);
  const pastor = pastorMatch ? `Rev. ${pastorMatch[1]}, Pastor` : undefined;

  return {
    serviceDate,
    serviceTime,
    liturgicalDay: "", // filled in later
    church: {
      name: churchName,
      address,
      web,
      phone,
    },
    pastor,
  };
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

function parseSections(lines: LayoutLine[], warnings: ParseWarning[]): Section[] {
  const sections: Section[] = [];
  let infoWarningCount = 0;

  // Skip cover/header pages — service starts when we hit the first known
  // section heading after the church address block.
  // We look for "Welcome" or "Introit" as the first real section heading.
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = matchHeading(lines[i]);
    if (m && (m.heading === "Welcome" || m.heading === "Introit")) {
      bodyStart = i;
      break;
    }
  }

  const body = lines.slice(bodyStart);

  let i = 0;

  // The section-heading X position (left margin = 36).
  const HEADING_X = 36;
  // Speaker lines appear at x≈45, text at x≈63.
  const SPEAKER_X = 45;

  function emitInfoWarning(msg: string, lineHint?: string) {
    if (infoWarningCount < 5) {
      warnings.push({ message: msg, severity: "info", lineHint });
      infoWarningCount++;
    }
  }

  let inPsalmSection = false;

  while (i < body.length) {
    const line = body[i];

    // Skip page numbers: standalone small numbers at far-right margin
    // or small page-number lines at the very bottom of the page (y < 30).
    if (isNumericOnly(line.text) && (line.y < 30 || line.minX > 300)) {
      i++;
      continue;
    }

    const headingMatch = matchHeading(line);
    if (headingMatch) {
      const { heading, rightText } = headingMatch;
      inPsalmSection = heading === "Psalm";

      // Skip decorative / liturgical-day lines that happen to match (shouldn't
      // occur since SECTION_HEADINGS is specific, but guard anyway).

      // -----------------------------------------------------------------------
      // Song sections
      // -----------------------------------------------------------------------
      if (heading === "Song") {
        // Columns: [0] = "Song", [1] = title, [2] = authors
        const title = line.columns[1]?.[1]?.trim() ?? "";
        const authors = line.columns[2]?.[1]?.trim() ?? undefined;

        if (!title) {
          warnings.push({
            message: `Song line did not yield a title: ${JSON.stringify(line.text)}`,
            severity: "warn",
            lineHint: line.text,
          });
        }

        // Next line may be the stanza plan (indented, no speaker prefix, no heading)
        let stanzaPlan: string | undefined;
        i++;
        if (i < body.length) {
          const next = body[i];
          const nextHeading = matchHeading(next);
          const nextSpeaker = parseSpeakerLine(next);
          if (!nextHeading && !nextSpeaker && next.minX > HEADING_X && next.text.trim()) {
            stanzaPlan = next.text.trim();
            i++;
          }
        }

        sections.push({
          kind: "song",
          title,
          authors,
          stanzaPlan,
        } satisfies Song);
        continue;
      }

      // -----------------------------------------------------------------------
      // Note sections (Acknowledgments, Resources, Communion Theology)
      // -----------------------------------------------------------------------
      if (NOTE_HEADINGS.has(heading)) {
        i++;
        const noteLines: string[] = [];
        while (i < body.length) {
          const next = body[i];
          if (matchHeading(next)) break;
          if (isNumericOnly(next.text) && (next.y < 30 || next.minX > 300)) {
            i++;
            continue;
          }
          noteLines.push(next.text.trim());
          i++;
        }
        sections.push({
          kind: "note",
          title: heading,
          text: noteLines.filter(Boolean).join("\n"),
          includeInSlides: SLIDES_EXCLUDED_BY_DEFAULT.has(heading) ? false : undefined,
        } satisfies Note);
        continue;
      }

      // -----------------------------------------------------------------------
      // Pure section headers (no child content)
      // -----------------------------------------------------------------------
      if (PURE_HEADER_HEADINGS.has(heading)) {
        sections.push({ kind: "header", title: heading } satisfies SectionHeader);
        i++;
        continue;
      }

      // -----------------------------------------------------------------------
      // Reading sections (Old Testament Reading, Epistle, Holy Gospel)
      // -----------------------------------------------------------------------
      if (READING_HEADINGS.has(heading)) {
        const citation = rightText;
        sections.push({
          kind: "reading",
          title: heading,
          citation,
        } satisfies Reading);
        i++;

        // Collect subsequent P/C/A/L lines (response liturgy) as a LiturgyBlock
        const responseItems: LiturgyItem[] = [];
        while (i < body.length) {
          const next = body[i];
          if (matchHeading(next)) break;
          if (isNumericOnly(next.text) && (next.y < 30 || next.minX > 300)) {
            i++;
            continue;
          }

          const speaker = parseSpeakerLine(next);
          if (speaker) {
            let text = speaker.text;
            // Collect continuations
            i++;
            while (i < body.length) {
              const cont = body[i];
              if (isContinuation(cont, SPEAKER_X)) {
                text += " " + cont.text.trim();
                i++;
              } else {
                break;
              }
            }
            responseItems.push({ kind: "spoken", speaker: speaker.speaker, text });
          } else if (next.minX >= SPEAKER_X - 2 && next.text.trim()) {
            // Rubric-like line within a reading (e.g. the reading text itself
            // or a response). Skip body text of the reading — only capture
            // speaker lines and short response rubrics.
            // We emit nothing for the reading body text itself.
            i++;
          } else {
            i++;
          }
        }

        if (responseItems.length > 0) {
          sections.push({
            kind: "liturgy",
            title: heading + " Response",
            items: responseItems,
          } satisfies LiturgyBlock);
        }
        continue;
      }

      // -----------------------------------------------------------------------
      // LSB hymnal reference headings (e.g. Nicene Creed LSB 158)
      // -----------------------------------------------------------------------
      if (LSB_HEADINGS.has(heading)) {
        // Parse rightText for LSB number
        const lsbMatch = rightText.match(/LSB\s+(\d+)/);
        // Fall through to liturgy block parsing below, but also track hymnal
        // We'll handle this in the liturgy block items and attach it differently.
        // For now, build a liturgy block; the LSB ref goes on the Song/Liturgy title.
        const items = collectLiturgyItems(body, i + 1, warnings, infoWarningCount, emitInfoWarning, inPsalmSection);
        i = items.nextIndex;
        infoWarningCount = items.warnCount;

        // Build a title with the LSB ref
        const titleWithRef = lsbMatch ? `${heading} (LSB ${lsbMatch[1]})` : heading;
        if (items.items.length > 0) {
          sections.push({
            kind: "liturgy",
            title: titleWithRef,
            items: items.items,
          } satisfies LiturgyBlock);
        } else {
          sections.push({ kind: "header", title: titleWithRef } satisfies SectionHeader);
        }
        continue;
      }

      // -----------------------------------------------------------------------
      // General liturgy block or section header
      // -----------------------------------------------------------------------
      const items = collectLiturgyItems(body, i + 1, warnings, infoWarningCount, emitInfoWarning, inPsalmSection);
      i = items.nextIndex;
      infoWarningCount = items.warnCount;

      if (items.items.length > 0) {
        const title = heading + (rightText ? `  ${rightText}` : "");
        sections.push({
          kind: "liturgy",
          title,
          items: items.items,
          includeInSlides: SLIDES_EXCLUDED_BY_DEFAULT.has(heading) ? false : undefined,
        } satisfies LiturgyBlock);
      } else {
        // No immediate child items — emit as header
        sections.push({ kind: "header", title: heading } satisfies SectionHeader);
      }
      continue;
    }

    // Not a heading. Could be a rubric, speaker, or stray line at the top.
    // These appear before the first heading in body — skip them.
    i++;
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Collect liturgy items until the next section heading
// ---------------------------------------------------------------------------

type CollectResult = {
  items: LiturgyItem[];
  nextIndex: number;
  warnCount: number;
};

function collectLiturgyItems(
  lines: LayoutLine[],
  startIndex: number,
  _warnings: ParseWarning[],
  warnCount: number,
  emitInfo: (msg: string, hint?: string) => void,
  inPsalmSection: boolean
): CollectResult {
  const items: LiturgyItem[] = [];
  let i = startIndex;

  // Speaker text indented at roughly x=63; speaker prefix at x≈45-46
  const SPEAKER_PREFIX_X = 45;

  while (i < lines.length) {
    const line = lines[i];

    // Stop at the next section heading
    if (matchHeading(line)) break;

    // Skip standalone page numbers
    if (isNumericOnly(line.text) && (line.y < 30 || line.minX > 300)) {
      i++;
      continue;
    }

    // Skip "continued on next page" footer
    if (line.text.trim() === "continued on next page") {
      i++;
      continue;
    }

    // In Psalm section, strip standalone verse-number artifacts.
    // Verse numbers are numeric-only lines at indented positions within the psalm.
    if (inPsalmSection && isNumericOnly(line.text.trim())) {
      i++;
      continue;
    }

    const speaker = parseSpeakerLine(line);
    if (speaker) {
      let text = speaker.text;
      i++;
      // Collect continuation lines
      while (i < lines.length) {
        const cont = lines[i];
        if (matchHeading(cont)) break;
        if (parseSpeakerLine(cont)) break;
        if (isNumericOnly(cont.text) && (cont.y < 30 || cont.minX > 300)) {
          i++;
          continue;
        }
        if (cont.minX > SPEAKER_PREFIX_X && !matchHeading(cont)) {
          text += " " + cont.text.trim();
          i++;
        } else {
          break;
        }
      }
      items.push({ kind: "spoken", speaker: speaker.speaker, text });
      continue;
    }

    // Rubric or reading body text
    const trimmed = line.text.trim();
    if (trimmed) {
      // Heuristic: if the line is at the section-heading X level (minX ≈ 36)
      // but is NOT a known heading, treat it as a rubric.
      // If it's indented at x≈45+ and not a speaker line, it might be
      // reading body text — we skip that in reading sections.
      items.push({ kind: "rubric", text: trimmed });
      i++;
    } else {
      i++;
    }
  }

  return { items, nextIndex: i, warnCount };
}
