import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { readLibrary, writeLibrary, findHymnByTitle, upsertHymn } from "../lib/hymn-library";
import type { HymnLibrary, Hymn } from "../lib/hymn-library";

const TMP_DIR = join(__dirname, "../data/__test__");
const TMP_PATH = join(TMP_DIR, "hymns-test.json");

const FIXTURE: HymnLibrary = {
  songs: [
    {
      id: "everlasting-god",
      title: "Everlasting God",
      authors: "Brown, Riley",
      slides: [
        {
          tag: "verse-1",
          lines: [
            "Strength will rise as we wait upon the Lord.",
            "We will wait upon the Lord, we will wait upon the Lord.",
          ],
        },
        {
          tag: "chorus",
          lines: [
            "You are the everlasting God, the everlasting God.",
            "You do not faint, You won't grow weary.",
          ],
        },
      ],
    },
    {
      id: "my-hope",
      title: "My Hope",
      authors: "Baloche, Kerr, Mellinger, Rabe",
      slides: [
        {
          tag: "verse-1",
          lines: ["Nothing will change if all the plans I make go wrong;"],
        },
      ],
    },
  ],
};

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe("hymn-library — round-trip", () => {
  it("write then read produces deep-equal library", () => {
    writeLibrary(FIXTURE, TMP_PATH);
    const result = readLibrary(TMP_PATH);
    expect(result).toEqual(FIXTURE);
  });
});

describe("hymn-library — findHymnByTitle", () => {
  it("finds hymn with exact title casing", () => {
    const hymn = findHymnByTitle(FIXTURE, "Everlasting God");
    expect(hymn).toBeDefined();
    expect(hymn?.id).toBe("everlasting-god");
    expect(hymn?.authors).toBe("Brown, Riley");
  });

  it("finds hymn with lowercase title", () => {
    const hymn = findHymnByTitle(FIXTURE, "everlasting god");
    expect(hymn).toBeDefined();
    expect(hymn?.id).toBe("everlasting-god");
  });

  it("returns undefined for a title that does not exist", () => {
    const hymn = findHymnByTitle(FIXTURE, "Doesn't Exist");
    expect(hymn).toBeUndefined();
  });

  it("finds hymn with punctuation stripped from search title", () => {
    const hymn = findHymnByTitle(FIXTURE, "My Hope!");
    expect(hymn).toBeDefined();
    expect(hymn?.title).toBe("My Hope");
  });
});

// ---------------------------------------------------------------------------
// copyright field — round-trip and upsertHymn
// ---------------------------------------------------------------------------

describe("hymn-library — copyright round-trip", () => {
  it("copyright survives writeLibrary / readLibrary", () => {
    const lib: HymnLibrary = {
      songs: [
        {
          id: "everlasting-god",
          title: "Everlasting God",
          copyright:
            "'Everlasting God' - words and music by Brenton Brown, Ken Riley\n" +
            "©2005 Thankyou Music (Admin. by Capitol CMG Publishing)\n" +
            "CCLI License No. 236495, streaming lic No. 20373402",
          slides: [{ tag: "verse-1", lines: ["Strength will rise."] }],
        },
      ],
    };
    writeLibrary(lib, TMP_PATH);
    const result = readLibrary(TMP_PATH);
    expect(result.songs[0].copyright).toBe(lib.songs[0].copyright);
  });

  it("upsertHymn preserves copyright when updating an existing hymn", () => {
    const original: Hymn = {
      id: "everlasting-god",
      title: "Everlasting God",
      copyright: "©2005 Thankyou Music",
      slides: [{ tag: "verse-1", lines: ["Old line."] }],
    };
    const lib: HymnLibrary = { songs: [original] };

    const updated: Hymn = {
      id: "everlasting-god",
      title: "Everlasting God",
      copyright: "©2005 Thankyou Music (updated)",
      slides: [{ tag: "verse-1", lines: ["New line."] }],
    };
    const result = upsertHymn(lib, updated);
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].copyright).toBe("©2005 Thankyou Music (updated)");
    expect(result.songs[0].slides[0].lines[0]).toBe("New line.");
  });

  it("copyright is optional — hymn without copyright round-trips without it", () => {
    const lib: HymnLibrary = {
      songs: [
        {
          id: "no-copyright",
          title: "No Copyright",
          slides: [{ tag: "verse-1", lines: ["A line."] }],
        },
      ],
    };
    writeLibrary(lib, TMP_PATH);
    const result = readLibrary(TMP_PATH);
    expect(result.songs[0].copyright).toBeUndefined();
  });
});
