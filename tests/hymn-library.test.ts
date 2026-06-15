import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { readLibrary, writeLibrary, findHymnByTitle } from "../lib/hymn-library";
import type { HymnLibrary } from "../lib/hymn-library";

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
