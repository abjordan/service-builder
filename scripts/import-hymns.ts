#!/usr/bin/env tsx
// One-time importer: reads Hymns.pptx -> data/hymns.json
//
// Usage:  npx tsx scripts/import-hymns.ts [path/to/Hymns.pptx]
// Default PPTX path: examples/20260614/Hymns.pptx

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Hymn, HymnSlideContent, HymnLibrary } from "../lib/hymn-library";
import { writeLibrary } from "../lib/hymn-library";

// ---------------------------------------------------------------------------
// Known songs for boundary detection (bulletin order)
// ---------------------------------------------------------------------------
const KNOWN_SONGS: Array<{ title: string; authors: string }> = [
  { title: "Everlasting God", authors: "Brown, Riley" },
  { title: "Resound in Praise", authors: "Funk" },
  { title: "Mighty To Save", authors: "Fielding, Morgan" },
  { title: "My Hope", authors: "Baloche, Kerr, Mellinger, Rabe" },
];

// ---------------------------------------------------------------------------
// PPTX text extraction via unzip + regex
// ---------------------------------------------------------------------------

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&"); // last, so &amp;lt; doesn't double-decode
}

/**
 * Extract one line per <a:p> paragraph from a slide, joining the paragraph's
 * <a:t> runs. PowerPoint splits a single line across runs at formatting
 * changes (e.g. the CCLI line becomes "…streaming " + "lic" + " No. 20373402"),
 * and the inter-run spaces live in the run text — so joining with "" rebuilds
 * the line. Each lyric line is its own paragraph, so this is identity for them.
 */
function extractTextRuns(pptxPath: string, slideNum: number): string[] {
  const entryPath = `ppt/slides/slide${slideNum}.xml`;
  const xml = execSync(`unzip -p "${pptxPath}" "${entryPath}"`, {
    encoding: "utf-8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const lines: string[] = [];
  const paraRe = /<a:p>([\s\S]*?)<\/a:p>/g;
  const runRe = /<a:t>([^<]*)<\/a:t>/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(xml)) !== null) {
    let joined = "";
    let rm: RegExpExecArray | null;
    runRe.lastIndex = 0;
    while ((rm = runRe.exec(pm[1])) !== null) {
      joined += decodeXmlEntities(rm[1]);
    }
    const line = joined.trim();
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** Count total slides by checking which slide XMLs exist in the archive. */
function countSlides(pptxPath: string): number {
  const listing = execSync(`unzip -l "${pptxPath}"`, {
    encoding: "utf-8",
    maxBuffer: 4 * 1024 * 1024,
  });
  let max = 0;
  const re = /ppt\/slides\/slide(\d+)\.xml/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(listing)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Slide-content classification
// ---------------------------------------------------------------------------

/**
 * Lines that should be stripped: copyright boilerplate, CCLI lines, stanza
 * plans, attribution lines. These appear consistently on each slide header.
 */
function isBoilerplateLine(line: string): boolean {
  const l = line.toLowerCase();
  // Copyright symbol lines
  if (l.startsWith("©") || l.startsWith("(c)")) return true;
  // CCLI and streaming license lines
  if (l.startsWith("ccli") || l.startsWith("streaming")) return true;
  if (l.includes("license no.") || l.includes("lic no.") || l.includes("lic no")) return true;
  // Split CCLI suffix: " No. 20373402" appears as a separate run
  if (/^no\.\s*\d+/.test(l)) return true;
  // Free-standing "lic" artifact from split licensing run
  if (/^lic$/.test(l)) return true;
  // Attribution lines: 'SongTitle' - words and music by ...
  if (/^['"‘’“”].+['"‘’“”]\s*-\s*(words|music)/i.test(line)) return true;
  // Copyright admin lines that got broken into separate runs
  if (l.includes("admin.") || l.includes("(admin by") || l.includes("admin by")) return true;
  // Stanza-plan lines like "Verse 1, Chorus, Verse 2, ..." or "Verse, Chorus x2, ..."
  if (/^(verse|v\d|chorus|bridge|v1|v2|v3)[\s,x\d]*(,\s*(verse|v\d|chorus|bridge|v1|v2|v3))/i.test(line)) return true;
  return false;
}

/** Tag inference from section-label text. */
function inferTag(labelText: string): string {
  const t = labelText.toLowerCase().trim();
  if (/^v1$|^verse\s*1$/.test(t)) return "verse-1";
  if (/^v2$|^verse\s*2$/.test(t)) return "verse-2";
  if (/^v3$|^verse\s*3$/.test(t)) return "verse-3";
  if (/^chorus$|^ch$/.test(t)) return "chorus";
  if (/^bridge$/.test(t)) return "bridge";
  if (/^verse$/.test(t)) return "verse-1"; // undifferentiated "verse"
  return "unknown";
}

/** Section-label tokens (structural, not lyric lines). */
const SECTION_LABEL_TOKENS = new Set([
  "v1", "v2", "v3",
  "verse", "verse 1", "verse 2", "verse 3",
  "chorus", "bridge",
]);

function isSectionLabel(run: string): boolean {
  return SECTION_LABEL_TOKENS.has(run.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Song boundary detection
// ---------------------------------------------------------------------------

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function matchesKnownTitle(run: string): { title: string; authors: string } | undefined {
  const nr = normTitle(run);
  return KNOWN_SONGS.find((s) => nr.includes(normTitle(s.title)));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const pptxPath = process.argv[2] ?? join("examples", "20260614", "Hymns.pptx");

  if (!existsSync(pptxPath)) {
    process.stderr.write(`ERROR: PPTX not found: ${pptxPath}\n`);
    process.exit(1);
  }

  const totalSlides = countSlides(pptxPath);
  process.stderr.write(`Found ${totalSlides} slides in ${pptxPath}\n`);

  // Step 1: extract all slides into a flat list of (slideIndex, runs)
  type SlideRaw = { index: number; runs: string[] };
  const rawSlides: SlideRaw[] = [];
  for (let i = 1; i <= totalSlides; i++) {
    const runs = extractTextRuns(pptxPath, i);
    rawSlides.push({ index: i, runs });
  }

  // Debug listing
  process.stderr.write("\nSlide first-run index:\n");
  for (const s of rawSlides) {
    process.stderr.write(`  slide ${s.index}: ${JSON.stringify(s.runs[0] ?? "(empty)")}\n`);
  }

  // Step 2: group slides by song using known-title detection.
  // Each slide that contains a known title is grouped with that song.
  // Slides matched by title are re-grouped (not split) — every slide in
  // Hymns.pptx carries the song title so boundary = title change.
  type SongGroup = { meta: (typeof KNOWN_SONGS)[number]; slides: SlideRaw[] };
  const groups: SongGroup[] = [];
  let currentGroup: SongGroup | undefined;

  for (const slide of rawSlides) {
    // Check every run for a title match
    let matched: (typeof KNOWN_SONGS)[number] | undefined;
    for (const run of slide.runs) {
      matched = matchesKnownTitle(run);
      if (matched) break;
    }

    if (matched) {
      if (!currentGroup || currentGroup.meta.title !== matched.title) {
        // New song boundary
        currentGroup = { meta: matched, slides: [slide] };
        groups.push(currentGroup);
      } else {
        currentGroup.slides.push(slide);
      }
    } else if (currentGroup) {
      // No title match but mid-song — append to current song
      currentGroup.slides.push(slide);
    } else {
      process.stderr.write(
        `  skip slide ${slide.index} (before first song): ${JSON.stringify(slide.runs[0] ?? "")}\n`
      );
    }
  }

  // Step 3: convert groups -> Hymn records
  const songs: Hymn[] = [];

  for (const group of groups) {
    const id = group.meta.title
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "-");

    const hymnSlides: HymnSlideContent[] = [];
    // Attribution / copyright / CCLI lines, captured from the header of the
    // first slide (every slide in a song repeats the same header).
    let copyright: string | undefined;

    for (const slide of group.slides) {
      // Split each PPTX slide into its labeled sections. Header lines (title,
      // copyright, attribution) precede the first section label; a slide
      // commonly carries a verse AND its chorus, so each label starts a new
      // block to keep verse and refrain distinct.
      type Block = { tag: string; lines: string[] };
      const blocks: Block[] = [];
      let current: Block | null = null;
      const header: string[] = [];

      for (const run of slide.runs) {
        // The song title repeats on every slide. Match it EXACTLY — a lyric
        // line that merely contains the title (e.g. the hook "You are the
        // everlasting God") is not the title and must be kept.
        if (normTitle(run) === normTitle(group.meta.title)) continue;

        if (isSectionLabel(run)) {
          if (current && current.lines.length > 0) blocks.push(current);
          current = { tag: inferTag(run), lines: [] };
          continue;
        }

        // Everything before the first label is the header: attribution /
        // copyright / CCLI. Keep it for the slide footer.
        if (!current) {
          header.push(run);
          continue;
        }

        // Boilerplate that appears mid-lyric, e.g. the stanza-plan line
        // "Verse 1, Chorus, Verse 2, ...".
        if (isBoilerplateLine(run)) continue;

        current.lines.push(run);
      }
      if (current && current.lines.length > 0) blocks.push(current);

      if (!copyright && header.length > 0) copyright = header.join("\n");

      // Each PPTX slide is one on-screen slide. Mark the first block of each
      // slide (after the very first) as a manual break so the expander keeps a
      // slide's verse + refrain together instead of repacking purely by height.
      blocks.forEach((b, i) => {
        hymnSlides.push({
          tag: b.tag,
          lines: b.lines,
          ...(i === 0 && hymnSlides.length > 0 ? { startNewSlide: true } : {}),
        });
      });
    }

    const hymn: Hymn = {
      id,
      title: group.meta.title,
      authors: group.meta.authors,
      ...(copyright ? { copyright } : {}),
      slides: hymnSlides,
    };
    songs.push(hymn);
  }

  // Validation warnings
  if (songs.length < 4) {
    process.stderr.write(`\nWARNING: expected 4 songs, got ${songs.length}\n`);
  }
  const totalExtractedSlides = songs.reduce((acc, h) => acc + h.slides.length, 0);
  if (totalExtractedSlides < 9) {
    process.stderr.write(`\nWARNING: expected >= 9 lyric slides, got ${totalExtractedSlides}\n`);
  }

  // Summary to stderr
  process.stderr.write(`\nExtracted ${songs.length} songs, ${totalExtractedSlides} lyric slides:\n`);
  for (const h of songs) {
    const tags = h.slides.map((s) => s.tag);
    process.stderr.write(`  ${h.title}: ${h.slides.length} slides, tags: [${tags.join(", ")}]\n`);
  }

  const lib: HymnLibrary = { songs };
  writeLibrary(lib);
  process.stderr.write(`\nWrote data/hymns.json\n`);
}

main();
