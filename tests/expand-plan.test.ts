import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandPlan, splitTextForSlides, packHymnBlocks } from "../lib/expand-plan";
import type { ServicePlan } from "../lib/service-plan";
import type { HymnLibrary } from "../lib/hymn-library";
import type { HymnBlock } from "../lib/render-slide";

// ---------------------------------------------------------------------------
// Fixtures loaded once for the suite
// ---------------------------------------------------------------------------

function loadPlan(): ServicePlan {
  const raw = readFileSync(
    join(__dirname, "../examples/20260614/parsed-plan.json"),
    "utf-8",
  );
  return JSON.parse(raw) as ServicePlan;
}

function loadLibrary(): HymnLibrary {
  const raw = readFileSync(join(__dirname, "../data/hymns.json"), "utf-8");
  return JSON.parse(raw) as HymnLibrary;
}

const plan = loadPlan();
const library = loadLibrary();

// ---------------------------------------------------------------------------
// Test 1 — baseline expansion produces > 20 slides
// ---------------------------------------------------------------------------

describe("expandPlan — baseline", () => {
  it("returns ExpandResult with slides.length > 20", () => {
    const result = expandPlan(plan, { library });
    expect(result.slides.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — no section-title slides ever emitted
// ---------------------------------------------------------------------------

describe("expandPlan — no section-title slides", () => {
  it("emits zero section-title slides", () => {
    const result = expandPlan(plan, { library });
    const sectionTitles = result.slides.filter(
      (s) => s.slide.kind === ("section-title" as string),
    );
    expect(sectionTitles).toHaveLength(0);
  });

  it("all slides are of kind liturgy, reading, or hymn", () => {
    const result = expandPlan(plan, { library });
    const validKinds = new Set(["liturgy", "reading", "hymn"]);
    for (const s of result.slides) {
      expect(validKinds.has(s.slide.kind)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3 — sections with includeInSlides === false are excluded
// ---------------------------------------------------------------------------

describe("expandPlan — includeInSlides filter", () => {
  it("emits no slide sourced from an excluded section", () => {
    const result = expandPlan(plan, { library });

    const excludedIndexes = new Set<number>();
    plan.sections.forEach((s, i) => {
      if (s.includeInSlides === false) excludedIndexes.add(i);
    });

    const leaking = result.slides.filter((s) =>
      excludedIndexes.has(s.sectionIndex),
    );
    expect(leaking).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — no liturgy slide contains a rubric item
// ---------------------------------------------------------------------------

describe("expandPlan — rubric filtering", () => {
  it("no liturgy slide has a rubric item", () => {
    const result = expandPlan(plan, { library });
    const liturgySlides = result.slides.filter(
      (s) => s.slide.kind === "liturgy",
    );
    for (const s of liturgySlides) {
      if (s.slide.kind === "liturgy") {
        for (const item of s.slide.items) {
          expect(item.speaker).toBeDefined();
          expect(["P", "C", "A", "L"]).toContain(item.speaker);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5 — liturgy slides carry the section title
// ---------------------------------------------------------------------------

describe("expandPlan — liturgy title propagation", () => {
  it("liturgy slides from the Salutation section carry title 'Salutation and Collect of the Day'", () => {
    const result = expandPlan(plan, { library });

    const salutationPair = result.slides.find(
      (s) =>
        s.slide.kind === "liturgy" &&
        s.slide.items.some((item) => item.text.includes("The Lord be with you.")),
    );

    expect(salutationPair).toBeDefined();
    if (salutationPair && salutationPair.slide.kind === "liturgy") {
      expect(salutationPair.slide.title).toBe("Salutation and Collect of the Day");
    }
  });

  it("liturgy slides from sections with no title have title undefined or empty", () => {
    const result = expandPlan(plan, { library });
    const liturgySlides = result.slides.filter((s) => s.slide.kind === "liturgy");
    // All liturgy slides should have either a string title or undefined — never null
    for (const s of liturgySlides) {
      if (s.slide.kind === "liturgy") {
        expect(s.slide.title === undefined || typeof s.slide.title === "string").toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6 — auto-pair: "P The Lord be with you." / "C And also with you."
//           should end up on a single liturgy slide
// ---------------------------------------------------------------------------

describe("expandPlan — auto-pair (default threshold 200)", () => {
  it("salutation P/C pair lands on a single slide with 2 items", () => {
    const result = expandPlan(plan, { library });

    const pairSlide = result.slides.find(
      (s) =>
        s.slide.kind === "liturgy" &&
        s.slide.items.some((item) =>
          item.text.includes("The Lord be with you."),
        ),
    );

    expect(pairSlide).toBeDefined();
    if (pairSlide && pairSlide.slide.kind === "liturgy") {
      expect(pairSlide.slide.items).toHaveLength(2);
      expect(pairSlide.slide.items[0].speaker).toBe("P");
      expect(pairSlide.slide.items[1].speaker).toBe("C");
      expect(pairSlide.slide.items[1].text).toBe("And also with you.");
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7 — auto-pair suppressed when pairCharThreshold is too low
// ---------------------------------------------------------------------------

describe("expandPlan — auto-pair threshold override", () => {
  it("with pairCharThreshold: 10, salutation pair is NOT merged", () => {
    const result = expandPlan(plan, { library, pairCharThreshold: 10 });

    const pairSlide = result.slides.find(
      (s) =>
        s.slide.kind === "liturgy" &&
        s.slide.items.some((item) =>
          item.text.includes("The Lord be with you."),
        ),
    );

    expect(pairSlide).toBeDefined();
    if (pairSlide && pairSlide.slide.kind === "liturgy") {
      expect(pairSlide.slide.items).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 8 — each song with includeInSlides !== false produces hymn slides
// ---------------------------------------------------------------------------

describe("expandPlan — hymn expansion", () => {
  it("produces at least one hymn slide for every included song", () => {
    const result = expandPlan(plan, { library });

    const includedSongs = plan.sections.filter(
      (s) => s.kind === "song" && s.includeInSlides !== false,
    );

    for (const song of includedSongs) {
      if (song.kind !== "song") continue;
      const hymnSlides = result.slides.filter(
        (s) => s.slide.kind === "hymn" && s.slide.title === song.title,
      );
      expect(hymnSlides.length).toBeGreaterThan(0);
    }
  });

  it("produces at least one hymn slide with title 'Everlasting God'", () => {
    const result = expandPlan(plan, { library });
    const found = result.slides.find(
      (s) => s.slide.kind === "hymn" && s.slide.title === "Everlasting God",
    );
    expect(found).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 9 — missing hymn → warning + placeholder slide
// ---------------------------------------------------------------------------

describe("expandPlan — missing hymn handling", () => {
  it("emits a warning and placeholder slide when a song is not in the library", () => {
    const reducedLibrary: HymnLibrary = {
      songs: library.songs.filter((h) => h.title !== "Everlasting God"),
    };

    const result = expandPlan(plan, { library: reducedLibrary });

    const sectionIndex = plan.sections.findIndex(
      (s) => s.kind === "song" && s.title === "Everlasting God",
    );
    expect(sectionIndex).toBeGreaterThanOrEqual(0);

    const warning = result.warnings.find(
      (w) =>
        w.sectionIndex === sectionIndex &&
        w.message.includes("Everlasting God"),
    );
    expect(warning).toBeDefined();

    const placeholder = result.slides.find(
      (s) =>
        s.sectionIndex === sectionIndex &&
        s.slide.kind === "hymn" &&
        s.slide.title === "Everlasting God" &&
        s.slide.blocks[0].lines[0].includes("[Lyrics not in library"),
    );
    expect(placeholder).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 10 — slide IDs are unique
// ---------------------------------------------------------------------------

describe("expandPlan — slide ID uniqueness", () => {
  it("all slide ids are unique across the result", () => {
    const result = expandPlan(plan, { library });
    const ids = result.slides.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Test 11 — Reading slides carry responseA and responseC
// ---------------------------------------------------------------------------

describe("expandPlan — reading response fields", () => {
  it("OT Reading slide carries responseA and responseC with Word of the Lord defaults", () => {
    const result = expandPlan(plan, { library });
    const otReading = result.slides.find(
      (s) =>
        s.slide.kind === "reading" &&
        s.slide.title === "Old Testament Reading",
    );
    expect(otReading).toBeDefined();
    if (otReading && otReading.slide.kind === "reading") {
      expect(otReading.slide.responseA).toBe("This is the Word of the Lord.");
      expect(otReading.slide.responseC).toBe("Thanks be to God.");
    }
  });

  it("Gospel reading emits two slides: pre-announce and post-response", () => {
    const result = expandPlan(plan, { library });
    const gospelSlides = result.slides.filter(
      (s) =>
        s.slide.kind === "reading" &&
        s.slide.title === "Holy Gospel",
    );
    expect(gospelSlides.length).toBe(2);

    const preAnnounce = gospelSlides[0];
    const postResponse = gospelSlides[1];

    if (preAnnounce && preAnnounce.slide.kind === "reading") {
      expect(preAnnounce.slide.responseA).toMatch(/The Holy Gospel according to/);
      expect(preAnnounce.slide.responseC).toBe("Glory to You, O Lord.");
    }

    if (postResponse && postResponse.slide.kind === "reading") {
      expect(postResponse.slide.responseA).toBe("This is the Gospel of the Lord.");
      expect(postResponse.slide.responseC).toBe("Praise to You, O Christ.");
    }
  });

  it("every reading slide has non-empty responseA and responseC", () => {
    const result = expandPlan(plan, { library });
    const readingSlides = result.slides.filter((s) => s.slide.kind === "reading");
    for (const s of readingSlides) {
      if (s.slide.kind === "reading") {
        expect(s.slide.responseA.length).toBeGreaterThan(0);
        expect(s.slide.responseC.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 12 — header sections emit no slides
// ---------------------------------------------------------------------------

describe("expandPlan — header sections", () => {
  it("header sections emit no slides", () => {
    const result = expandPlan(plan, { library });
    const headerIndexes = new Set<number>();
    plan.sections.forEach((s, i) => {
      if (s.kind === "header") headerIndexes.add(i);
    });
    const headerSlides = result.slides.filter((s) =>
      headerIndexes.has(s.sectionIndex),
    );
    expect(headerSlides).toHaveLength(0);
  });
});

describe("splitTextForSlides", () => {
  it("returns text as-is when under the limit", () => {
    const text = "Short and sweet.";
    expect(splitTextForSlides(text, 100)).toEqual([text]);
  });

  it("splits at sentence boundaries", () => {
    const text =
      "First sentence here. Second one follows. Third arrives next. Fourth completes the set.";
    const chunks = splitTextForSlides(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(40);
    expect(chunks.join(" ")).toBe(text);
  });

  it("greedy-packs short sentences into one chunk when they fit", () => {
    const text = "A. B. C. D. E.";
    expect(splitTextForSlides(text, 100)).toEqual([text]);
  });

  it("falls back to word boundaries when a single sentence exceeds the limit", () => {
    const long = "supercalifragilistic word splitting test of moderate length text";
    const chunks = splitTextForSlides(long, 25);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(25);
      expect(c).not.toMatch(/^\s|\s$/);
    }
  });

  it("splits the corporate confession into multiple chunks under 300 chars", () => {
    const mostMercifulGod =
      "Most merciful God, we confess that we are by nature sinful and unclean. " +
      "We have sinned against You in thought, word, and deed, by what we have done " +
      "and by what we have left undone. We have not loved You with our whole heart; " +
      "we have not loved our neighbors as ourselves. We justly deserve Your present " +
      "and eternal punishment. For the sake of Your Son, Jesus Christ, have mercy on us. " +
      "Forgive us, renew us, and lead us, so that we may delight in Your will and walk in " +
      "Your ways to the glory of Your holy name. Amen.";
    const chunks = splitTextForSlides(mostMercifulGod, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
  });
});

describe("expandPlan — long liturgy items split across slides", () => {
  it("splits the corporate confession across multiple slides", () => {
    const result = expandPlan(plan, { library });
    const matches = (pattern: RegExp) =>
      result.slides.some(
        (s) =>
          s.slide.kind === "liturgy" &&
          s.slide.items.some((it) => pattern.test(it.text)),
      );
    expect(matches(/Most merciful God/)).toBe(true);
    expect(matches(/Forgive us, renew us/)).toBe(true);
    const onSameSlide = result.slides.find(
      (s) =>
        s.slide.kind === "liturgy" &&
        s.slide.items.some(
          (it) =>
            /Most merciful God/.test(it.text) &&
            /Forgive us, renew us/.test(it.text),
        ),
    );
    expect(onSameSlide).toBeUndefined();
  });

  it("keeps every liturgy item under the slide character limit", () => {
    const result = expandPlan(plan, { library });
    for (const s of result.slides) {
      if (s.slide.kind !== "liturgy") continue;
      for (const item of s.slide.items) {
        expect(item.text.length).toBeLessThanOrEqual(300);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test — copyright field propagates to every hymn slide for that song
// ---------------------------------------------------------------------------

describe("expandPlan — copyright propagation", () => {
  it("every hymn slide for a library song with copyright carries that copyright", () => {
    const copyrightText =
      "'Everlasting God' - words and music by Brenton Brown, Ken Riley\n" +
      "©2005 Thankyou Music (Admin. by Capitol CMG Publishing)\n" +
      "CCLI License No. 236495, streaming lic No. 20373402";

    const songPlan: ServicePlan = {
      date: "2026-06-16",
      theme: "Test",
      sections: [
        {
          kind: "song",
          title: "Everlasting God",
          includeInSlides: true,
        },
      ],
    };

    const testLibrary: HymnLibrary = {
      songs: [
        {
          id: "everlasting-god",
          title: "Everlasting God",
          copyright: copyrightText,
          slides: [
            { tag: "verse-1", lines: ["Strength will rise as we wait upon the Lord."] },
            { tag: "chorus", lines: ["You are the everlasting God."] },
          ],
        },
      ],
    };

    const result = expandPlan(songPlan, { library: testLibrary });
    const hymnSlides = result.slides.filter((s) => s.slide.kind === "hymn");

    // Two short blocks auto-pack onto one slide.
    expect(hymnSlides).toHaveLength(1);
    const slide = hymnSlides[0].slide;
    if (slide.kind === "hymn") {
      expect(slide.blocks).toHaveLength(2);
      expect(slide.copyright).toBe(copyrightText);
    }
  });

  it("hymn slides for a library song without copyright have copyright undefined", () => {
    const songPlan: ServicePlan = {
      date: "2026-06-16",
      theme: "Test",
      sections: [
        {
          kind: "song",
          title: "No Copyright Hymn",
          includeInSlides: true,
        },
      ],
    };

    const testLibrary: HymnLibrary = {
      songs: [
        {
          id: "no-copyright-hymn",
          title: "No Copyright Hymn",
          slides: [
            { tag: "verse-1", lines: ["A line without copyright."] },
          ],
        },
      ],
    };

    const result = expandPlan(songPlan, { library: testLibrary });
    const hymnSlides = result.slides.filter((s) => s.slide.kind === "hymn");
    expect(hymnSlides).toHaveLength(1);
    if (hymnSlides[0].slide.kind === "hymn") {
      expect(hymnSlides[0].slide.copyright).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Test 12 — hymn block auto-packing
// ---------------------------------------------------------------------------

describe("packHymnBlocks", () => {
  const block = (tag: string, lineCount: number): HymnBlock => ({
    tag,
    lines: Array.from({ length: lineCount }, (_, i) => `${tag} line ${i + 1}`),
  });

  it("packs several short blocks onto one slide", () => {
    const groups = packHymnBlocks([block("verse-1", 2), block("chorus", 2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("starts a new slide when the next block would overflow the budget", () => {
    // Two ~9-line blocks cannot share the ~720px budget.
    const groups = packHymnBlocks([block("verse-1", 9), block("verse-2", 9)]);
    expect(groups).toHaveLength(2);
  });

  it("keeps an oversized single block on its own slide", () => {
    const groups = packHymnBlocks([block("verse-1", 20)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
  });

  it("preserves block order across groups", () => {
    const groups = packHymnBlocks([
      block("verse-1", 6),
      block("chorus", 2),
      block("verse-2", 6),
      block("chorus", 2),
    ]);
    const flatTags = groups.flat().map((b) => b.tag);
    expect(flatTags).toEqual(["verse-1", "chorus", "verse-2", "chorus"]);
  });

  it("returns an empty array for no blocks", () => {
    expect(packHymnBlocks([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 13 — manual slide-break markers (startNewSlide)
// ---------------------------------------------------------------------------

describe("expandPlan — manual slide breaks", () => {
  const planFor = (): ServicePlan => ({
    metadata: {
      serviceDate: "2026-06-21",
      liturgicalDay: "Test",
      church: { name: "LCS" },
    },
    sections: [{ kind: "song", title: "Break Test", includeInSlides: true }],
  });

  it("forces a slide boundary at a startNewSlide marker that would otherwise pack", () => {
    const library: HymnLibrary = {
      songs: [
        {
          id: "break-test",
          title: "Break Test",
          slides: [
            { tag: "verse-1", lines: ["short a"] },
            { tag: "chorus", lines: ["short b"], startNewSlide: true },
          ],
        },
      ],
    };

    const result = expandPlan(planFor(), { library });
    const hymnSlides = result.slides.filter((s) => s.slide.kind === "hymn");
    expect(hymnSlides).toHaveLength(2);
  });

  it("packs the same blocks onto one slide without the marker", () => {
    const library: HymnLibrary = {
      songs: [
        {
          id: "break-test",
          title: "Break Test",
          slides: [
            { tag: "verse-1", lines: ["short a"] },
            { tag: "chorus", lines: ["short b"] },
          ],
        },
      ],
    };

    const result = expandPlan(planFor(), { library });
    const hymnSlides = result.slides.filter((s) => s.slide.kind === "hymn");
    expect(hymnSlides).toHaveLength(1);
  });

  it("a marker on the first block is a no-op", () => {
    const library: HymnLibrary = {
      songs: [
        {
          id: "break-test",
          title: "Break Test",
          slides: [
            { tag: "verse-1", lines: ["short a"], startNewSlide: true },
            { tag: "chorus", lines: ["short b"] },
          ],
        },
      ],
    };

    const result = expandPlan(planFor(), { library });
    const hymnSlides = result.slides.filter((s) => s.slide.kind === "hymn");
    expect(hymnSlides).toHaveLength(1);
  });
});
