import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import {
  readLibrary,
  writeLibrary,
  slugify,
  upsertHymn,
  deleteHymnByTitle,
} from "../lib/hymn-library";
import type { Hymn, HymnLibrary } from "../lib/hymn-library";

const TMP_DIR = join(__dirname, "../data/__test__hymns-api");
const TMP_PATH = join(TMP_DIR, "hymns-api-test.json");

const SONG_A: Hymn = {
  id: "everlasting-god",
  title: "Everlasting God",
  authors: "Brown, Riley",
  slides: [{ tag: "verse-1", lines: ["Strength will rise as we wait upon the Lord."] }],
};

const SONG_B: Hymn = {
  id: "my-hope",
  title: "My Hope",
  slides: [{ tag: "verse-1", lines: ["Nothing will change."] }],
};

const FIXTURE: HymnLibrary = { songs: [SONG_A, SONG_B] };

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Everlasting God")).toBe("everlasting-god");
  });

  it("strips punctuation", () => {
    expect(slugify("Everlasting God!")).toBe("everlasting-god");
  });

  it("collapses multiple spaces to a single hyphen", () => {
    expect(slugify("My  Hope")).toBe("my-hope");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("!Title!")).toBe("title");
  });

  it("handles all-punctuation input gracefully", () => {
    expect(slugify("!!!")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// upsertHymn
// ---------------------------------------------------------------------------

describe("upsertHymn", () => {
  it("appends a new hymn and assigns the slugified id", () => {
    const lib: HymnLibrary = { songs: [SONG_A] };
    const result = upsertHymn(lib, SONG_B);
    expect(result.songs).toHaveLength(2);
    const added = result.songs[1];
    expect(added.title).toBe("My Hope");
    expect(added.id).toBe("my-hope");
  });

  it("sets id from slugify regardless of id passed in", () => {
    const hymnWithWrongId: Hymn = { ...SONG_A, id: "wrong-id" };
    const lib: HymnLibrary = { songs: [] };
    const result = upsertHymn(lib, hymnWithWrongId);
    expect(result.songs[0].id).toBe("everlasting-god");
  });

  it("replaces existing hymn matched by normalized title (no duplicate)", () => {
    const lib: HymnLibrary = { songs: [SONG_A, SONG_B] };
    const updated: Hymn = {
      ...SONG_A,
      authors: "Updated Author",
      slides: [{ tag: "chorus", lines: ["New lyric."] }],
    };
    const result = upsertHymn(lib, updated);
    expect(result.songs).toHaveLength(2);
    expect(result.songs[0].authors).toBe("Updated Author");
    expect(result.songs[0].slides[0].tag).toBe("chorus");
  });

  it("matches by normalized title (case-insensitive, punctuation-stripped)", () => {
    const lib: HymnLibrary = { songs: [SONG_A] };
    const lowerCased: Hymn = { ...SONG_A, title: "everlasting god!", authors: "Changed" };
    const result = upsertHymn(lib, lowerCased);
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].authors).toBe("Changed");
  });

  it("does not mutate the input library", () => {
    const lib: HymnLibrary = { songs: [SONG_A] };
    const original = JSON.stringify(lib);
    upsertHymn(lib, SONG_B);
    expect(JSON.stringify(lib)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// deleteHymnByTitle
// ---------------------------------------------------------------------------

describe("deleteHymnByTitle", () => {
  it("removes a matching hymn and reports removed: true", () => {
    const lib: HymnLibrary = { songs: [SONG_A, SONG_B] };
    const { library, removed } = deleteHymnByTitle(lib, "Everlasting God");
    expect(removed).toBe(true);
    expect(library.songs).toHaveLength(1);
    expect(library.songs[0].title).toBe("My Hope");
  });

  it("is a no-op and reports removed: false for a missing title", () => {
    const lib: HymnLibrary = { songs: [SONG_A] };
    const { library, removed } = deleteHymnByTitle(lib, "Does Not Exist");
    expect(removed).toBe(false);
    expect(library.songs).toHaveLength(1);
  });

  it("matches by normalized title", () => {
    const lib: HymnLibrary = { songs: [SONG_A] };
    const { library, removed } = deleteHymnByTitle(lib, "everlasting god!");
    expect(removed).toBe(true);
    expect(library.songs).toHaveLength(0);
  });

  it("does not mutate the input library on removal", () => {
    const lib: HymnLibrary = { songs: [SONG_A, SONG_B] };
    const original = JSON.stringify(lib);
    deleteHymnByTitle(lib, "Everlasting God");
    expect(JSON.stringify(lib)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Round-trip via temp file: upsert + delete
// ---------------------------------------------------------------------------

describe("round-trip via temp path", () => {
  it("persists upsert then delete correctly", () => {
    writeLibrary(FIXTURE, TMP_PATH);

    const lib1 = readLibrary(TMP_PATH);
    const newHymn: Hymn = {
      id: "",
      title: "Amazing Grace",
      slides: [{ tag: "verse-1", lines: ["Amazing grace! How sweet the sound."] }],
    };
    writeLibrary(upsertHymn(lib1, newHymn), TMP_PATH);

    const lib2 = readLibrary(TMP_PATH);
    expect(lib2.songs).toHaveLength(3);
    const grace = lib2.songs.find((h) => h.title === "Amazing Grace");
    expect(grace).toBeDefined();
    expect(grace!.id).toBe("amazing-grace");

    const { library: lib3, removed } = deleteHymnByTitle(lib2, "Amazing Grace");
    writeLibrary(lib3, TMP_PATH);
    expect(removed).toBe(true);

    const lib4 = readLibrary(TMP_PATH);
    expect(lib4.songs).toHaveLength(2);
    expect(lib4.songs.find((h) => h.title === "Amazing Grace")).toBeUndefined();
  });
});
