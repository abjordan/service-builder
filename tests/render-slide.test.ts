import { describe, it, expect } from "vitest";
import { renderSlide, HymnVerseSlide, Slide } from "../lib/render-slide";

// ---------------------------------------------------------------------------
// Back-compat: existing HymnVerseSlide tests (Stage 1)
// ---------------------------------------------------------------------------

const FIXTURE: HymnVerseSlide = {
  kind: "hymn-verse",
  hymnTitle: "A Mighty Fortress Is Our God",
  hymnNumber: "LSB 656",
  verseNumber: 1,
  lines: [
    "A mighty fortress is our God,",
    "A trusty shield and weapon;",
    "He helps us free from ev'ry need",
    "That hath us now o'ertaken.",
  ],
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Assert basic PNG validity — checks magic bytes and minimum size only. */
function assertValidPng(buf: Buffer): void {
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  expect(buf.byteLength).toBeGreaterThan(5000);
}

/** Assert PNG dimensions from IHDR chunk (bytes 16–23). */
function assertPngDimensions(buf: Buffer, w: number, h: number): void {
  expect(buf.readUInt32BE(16)).toBe(w);
  expect(buf.readUInt32BE(20)).toBe(h);
}

describe("renderSlide — back-compat HymnVerseSlide (Stage 1)", () => {
  it("returns a non-empty Buffer", async () => {
    const result = await renderSlide(FIXTURE);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("Buffer starts with PNG magic bytes", async () => {
    const result = await renderSlide(FIXTURE);
    expect(result.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it("Buffer byte length is greater than 5000", async () => {
    const result = await renderSlide(FIXTURE);
    expect(result.byteLength).toBeGreaterThan(5000);
  });

  it("PNG dimensions are 1920x1080 (IHDR chunk)", async () => {
    const result = await renderSlide(FIXTURE);
    assertPngDimensions(result, 1920, 1080);
  });

  it("works without an optional hymnNumber", async () => {
    const slideWithoutNumber: HymnVerseSlide = {
      kind: "hymn-verse",
      hymnTitle: "Amazing Grace",
      verseNumber: 2,
      lines: ["'Twas grace that taught my heart to fear,", "And grace my fears relieved;"],
    };
    const result = await renderSlide(slideWithoutNumber);
    assertPngDimensions(result, 1920, 1080);
  });
});

// ---------------------------------------------------------------------------
// New Slide union — one test per kind
// ---------------------------------------------------------------------------

describe("renderSlide — Slide union kinds", () => {
  it("liturgy (single item): produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "liturgy",
      items: [{ speaker: "P", text: "The Lord be with you." }],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("liturgy (two items, auto-paired): produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "liturgy",
      items: [
        { speaker: "P", text: "The Lord be with you." },
        { speaker: "C", text: "And also with you." },
      ],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("liturgy (single item, speaker C): produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "liturgy",
      items: [{ speaker: "C", text: "And also with you." }],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("liturgy with title: produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "liturgy",
      title: "Salutation and Collect of the Day",
      items: [
        { speaker: "P", text: "The Lord be with you." },
        { speaker: "C", text: "And also with you." },
      ],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("liturgy with title and citation (Psalm shape): produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "liturgy",
      title: "Psalm",
      citation: "Psalm 100",
      items: [
        { speaker: "A", text: "Make a joyful noise to the Lord." },
        { speaker: "C", text: "Serve the Lord with gladness!" },
      ],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("reading (OT): produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "reading",
      title: "Old Testament Reading",
      citation: "Exodus 19:2-8",
      responseA: "This is the Word of the Lord.",
      responseC: "Thanks be to God.",
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("reading (Gospel): produces valid 3230×360 PNG strip", async () => {
    const slide: Slide = {
      kind: "reading",
      title: "Holy Gospel",
      citation: "Matthew 9:35–10:20",
      responseA: "This is the Gospel of the Lord.",
      responseC: "Praise to You, O Christ.",
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 3230, 360);
  });

  it("hymn: produces valid 1920×1080 PNG", async () => {
    const slide: Slide = {
      kind: "hymn",
      title: "A Mighty Fortress",
      blocks: [{ lines: ["Line 1", "Line 2"] }],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 1920, 1080);
  });

  it("hymn with tag and hymnNumber: produces valid 1920×1080 PNG", async () => {
    const slide: Slide = {
      kind: "hymn",
      title: "A Mighty Fortress Is Our God",
      hymnNumber: "LSB 656",
      blocks: [
        {
          tag: "verse 1",
          lines: [
            "A mighty fortress is our God,",
            "A trusty shield and weapon;",
            "He helps us free from ev'ry need",
            "That hath us now o'ertaken.",
          ],
        },
      ],
    };
    const buf = await renderSlide(slide);
    assertValidPng(buf);
    assertPngDimensions(buf, 1920, 1080);
  });
});
