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

function isGospel(title: string): boolean {
  return /gospel/i.test(title);
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

        // Walk spoken items, applying auto-pair logic.
        let i = 0;
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
            push(
              { kind: "liturgy", items, title: sectionTitle || undefined },
              `${sectionTitle || "Liturgy"} — line ${lineNum}`,
            );
            i += 2;
          } else {
            const items: LiturgyLine[] = [
              { speaker: current.speaker, text: current.text },
            ];
            const lineNum = counter;
            push(
              { kind: "liturgy", items, title: sectionTitle || undefined },
              `${sectionTitle || "Liturgy"} — line ${lineNum}`,
            );
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
            },
            `${hymn.title} — slide ${slideNum}/${total}`,
          );
        }
        break;
      }

      case "reading": {
        const responseA = isGospel(section.title)
          ? "This is the Gospel of the Lord."
          : "This is the Word of the Lord.";
        const responseC = isGospel(section.title)
          ? "Praise to You, O Christ."
          : "Thanks be to God.";

        push(
          {
            kind: "reading",
            title: section.title,
            citation: section.citation,
            responseA,
            responseC,
          },
          section.title,
        );
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
