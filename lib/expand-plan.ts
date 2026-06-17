// Plan expander — converts a ServicePlan into a flat list of renderable slides.
//
// Pure function: no I/O, no side effects, no clock. Callers load the plan and
// hymn library from disk and pass them in.

import type { ServicePlan, LiturgyItem } from "./service-plan";
import type { Slide, LiturgyLine } from "./render-slide";
import type { HymnLibrary } from "./hymn-library";
import { findHymnByTitle } from "./hymn-library";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ExpandedSlide = {
  /** Stable key for React lists and OBS source names. */
  id: string;
  /** Source section index in the plan, for traceability. */
  sectionIndex: number;
  /** The renderable slide payload — passed directly to renderSlide. */
  slide: Slide;
  /** Optional human-readable label. */
  label?: string;
};

export type ExpandOptions = {
  /** Hymn library for looking up song lyrics by title. */
  library: HymnLibrary;
  /**
   * Char threshold for auto-pairing consecutive P/C (or A/C) exchanges on
   * one slide. Default: 200. Pair is emitted when the sum of both items'
   * text lengths is <= this value.
   */
  pairCharThreshold?: number;
};

export type ExpandResult = {
  slides: ExpandedSlide[];
  warnings: { sectionIndex: number; message: string }[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Max characters of body text that fit on a single 1920×360 liturgy strip
// without overflowing. Calibrated against the renderer's font (Source Serif
// Pro 40px) and the available body area (~1432px wide × 4–5 lines tall).
// Pairs are bounded by `pairCharThreshold` (200), so this only kicks in for
// long single-speaker items like the corporate confession.
const MAX_CHARS_PER_SLIDE = 300;

function isGospel(title: string): boolean {
  return /gospel/i.test(title);
}

export function splitTextForSlides(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.match(/[^.!?]+[.!?]?\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (current === "") {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChars) {
      current += " " + sentence;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((c) =>
    c.length <= maxChars ? [c] : hardSplitByWords(c, maxChars),
  );
}

function hardSplitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    if (current === "") {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += " " + w;
    } else {
      out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out;
}

// Ordinal word map for chapter numbers 1–30.
const ORDINALS: Record<number, string> = {
  1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
  6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
  11: "eleventh", 12: "twelfth", 13: "thirteenth", 14: "fourteenth",
  15: "fifteenth", 16: "sixteenth", 17: "seventeenth", 18: "eighteenth",
  19: "nineteenth", 20: "twentieth", 21: "twenty-first", 22: "twenty-second",
  23: "twenty-third", 24: "twenty-fourth", 25: "twenty-fifth",
  26: "twenty-sixth", 27: "twenty-seventh", 28: "twenty-eighth",
  29: "twenty-ninth", 30: "thirtieth",
};

// Gospel books that get the "St." prefix.
const SYNOPTIC_GOSPELS = new Set(["Matthew", "Mark", "Luke", "John"]);

type GospelAnnounce = {
  announceText: string;
  warning?: string;
};

function buildGospelAnnounce(citation: string): GospelAnnounce {
  // Citation format: "Matthew 9:35—10:8", "1 Corinthians 11:23—32", etc.
  // Extract book (everything before first digit) and chapter (first integer after book).
  const bookMatch = citation.match(/^(.*?)(\d)/);
  if (!bookMatch) {
    return {
      announceText: `The Holy Gospel according to ${citation}.`,
      warning: `Could not parse book from Gospel citation: "${citation}"`,
    };
  }

  const book = bookMatch[1].trim();
  // Strip leading numeric prefix ("1 ", "2 ", "3 ") for synoptic check — but
  // preserve the full name for display.
  const displayBook = book;
  const strippedBook = book.replace(/^\d+\s+/, "");

  const prefixedBook = SYNOPTIC_GOSPELS.has(strippedBook)
    ? `St. ${displayBook}`
    : displayBook;

  // First integer following the book name is the chapter.
  const chapterMatch = citation.slice(bookMatch[1].length).match(/^(\d+)/);
  if (!chapterMatch) {
    return {
      announceText: `The Holy Gospel according to ${prefixedBook}.`,
      warning: `Could not parse chapter from Gospel citation: "${citation}"`,
    };
  }

  const chapter = parseInt(chapterMatch[1], 10);
  const ordinal = ORDINALS[chapter];
  if (!ordinal) {
    return {
      announceText: `The Holy Gospel according to ${prefixedBook}, chapter ${chapter}.`,
      warning: `Chapter ${chapter} exceeds ordinal table — fell back to numeric for citation: "${citation}"`,
    };
  }

  return {
    announceText: `The Holy Gospel according to ${prefixedBook}, the ${ordinal} chapter.`,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function expandPlan(plan: ServicePlan, opts: ExpandOptions): ExpandResult {
  const threshold = opts.pairCharThreshold ?? 200;
  const slides: ExpandedSlide[] = [];
  const warnings: { sectionIndex: number; message: string }[] = [];

  for (let sectionIndex = 0; sectionIndex < plan.sections.length; sectionIndex++) {
    const section = plan.sections[sectionIndex];

    // Filter at the section level.
    if (section.includeInSlides === false) continue;

    let counter = 0;

    const push = (slide: Slide, label?: string) => {
      slides.push({
        id: `s${sectionIndex}-${slide.kind}-${counter}`,
        sectionIndex,
        slide,
        label,
      });
      counter++;
    };

    switch (section.kind) {
      case "header": {
        // Header sections no longer emit section-title slides — they are
        // bulletin structure markers only. No slide is emitted.
        break;
      }

      case "liturgy": {
        // Drop rubric items; keep only spoken lines.
        const spoken = section.items.filter(
          (item): item is Extract<LiturgyItem, { kind: "spoken" }> =>
            item.kind === "spoken",
        );

        if (spoken.length === 0) break;

        const sectionTitle = section.title ?? "";

        // Walk spoken items, applying auto-pair logic. Only the first emitted
        // slide of a section carries the title and citation — subsequent slides
        // render titleless to avoid visual repetition.
        let i = 0;
        let isFirstSlide = true;
        const sectionCitation = "citation" in section ? section.citation : undefined;
        const titleAndCitationFor = () => {
          if (isFirstSlide) {
            isFirstSlide = false;
            return {
              title: sectionTitle || undefined,
              citation: sectionCitation,
            };
          }
          return { title: undefined, citation: undefined };
        };
        while (i < spoken.length) {
          const current = spoken[i];
          const next = spoken[i + 1];

          // Auto-pair: P→C or A→C when combined length is within threshold.
          const canPair =
            next !== undefined &&
            (current.speaker === "P" || current.speaker === "A") &&
            next.speaker === "C" &&
            current.text.length + next.text.length <= threshold;

          if (canPair && next !== undefined) {
            const items: LiturgyLine[] = [
              { speaker: current.speaker, text: current.text },
              { speaker: next.speaker, text: next.text },
            ];
            const lineNum = counter;
            const { title, citation } = titleAndCitationFor();
            push(
              { kind: "liturgy", items, title, citation },
              `${sectionTitle || "Liturgy"} — line ${lineNum}`,
            );
            i += 2;
          } else {
            const chunks = splitTextForSlides(current.text, MAX_CHARS_PER_SLIDE);
            for (const chunk of chunks) {
              const items: LiturgyLine[] = [
                { speaker: current.speaker, text: chunk },
              ];
              const lineNum = counter;
              const { title, citation } = titleAndCitationFor();
              push(
                { kind: "liturgy", items, title, citation },
                `${sectionTitle || "Liturgy"} — line ${lineNum}`,
              );
            }
            i += 1;
          }
        }
        break;
      }

      case "song": {
        const hymn = findHymnByTitle(opts.library, section.title);

        if (!hymn) {
          warnings.push({
            sectionIndex,
            message: `Hymn not in library: ${section.title}`,
          });
          push(
            {
              kind: "hymn",
              title: section.title,
              lines: ["[Lyrics not in library — add via Stage 4 hymn editor]"],
            },
            `${section.title} — slide 1/1`,
          );
          break;
        }

        const total = hymn.slides.length;
        const hymnNumber =
          section.hymnal
            ? `${section.hymnal.source} ${section.hymnal.number}`
            : undefined;

        for (const hymnSlide of hymn.slides) {
          const rawTag = hymnSlide.tag.toLowerCase();
          const tag = rawTag === "unknown" ? undefined : rawTag;
          const slideNum = counter + 1;
          push(
            {
              kind: "hymn",
              title: hymn.title,
              hymnNumber,
              tag,
              lines: hymnSlide.lines,
              ...(hymn.copyright ? { copyright: hymn.copyright } : {}),
            },
            `${hymn.title} — slide ${slideNum}/${total}`,
          );
        }
        break;
      }

      case "reading": {
        if (isGospel(section.title)) {
          // Gospel readings emit two slides:
          // 1. Pre-announce: congregation announce + "Glory to You, O Lord."
          // 2. Post-response: "This is the Gospel of the Lord." + "Praise to You, O Christ."
          const announce = buildGospelAnnounce(section.citation);
          if (announce.warning) {
            warnings.push({ sectionIndex, message: announce.warning });
          }

          push(
            {
              kind: "reading",
              title: section.title,
              citation: section.citation,
              responseA: announce.announceText,
              responseC: "Glory to You, O Lord.",
            },
            `${section.title} — announce`,
          );

          push(
            {
              kind: "reading",
              title: section.title,
              citation: section.citation,
              responseA: "This is the Gospel of the Lord.",
              responseC: "Praise to You, O Christ.",
            },
            `${section.title} — response`,
          );
        } else {
          push(
            {
              kind: "reading",
              title: section.title,
              citation: section.citation,
              responseA: "This is the Word of the Lord.",
              responseC: "Thanks be to God.",
            },
            section.title,
          );
        }
        break;
      }

      case "note": {
        // Notes are bulletin-only content; never emit slides.
        break;
      }
    }
  }

  return { slides, warnings };
}
