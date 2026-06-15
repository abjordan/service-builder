import { describe, it, expect } from "vitest";
import { buildBundle } from "../lib/build-bundle";
import type { Stage1BuildRequest } from "../lib/build-bundle";

const SAMPLE_REQUEST: Stage1BuildRequest = {
  collectionName: "Test Collection",
  sceneName: "Test Scene",
  slide: {
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
  },
  obsExtractPath: "/tmp/test-obs-extract",
};

// ZIP local file header magic: PK\x03\x04
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

describe("buildBundle", () => {
  it("returns a Buffer starting with ZIP magic bytes", async () => {
    const result = await buildBundle(SAMPLE_REQUEST);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("returns a Buffer larger than 5000 bytes", async () => {
    const result = await buildBundle(SAMPLE_REQUEST);
    expect(result.byteLength).toBeGreaterThan(5000);
  });

  it("zip contains scene_collection.json filename in local file headers", async () => {
    const result = await buildBundle(SAMPLE_REQUEST);
    // ZIP local file headers store filenames as UTF-8 strings — we can search
    // for them as substrings without parsing the full zip structure.
    const str = result.toString("latin1");
    expect(str).toContain("scene_collection.json");
  });

  it("zip contains assets/slide.png filename in local file headers", async () => {
    const result = await buildBundle(SAMPLE_REQUEST);
    const str = result.toString("latin1");
    expect(str).toContain("assets/slide.png");
  });

  it("zip contains README.txt filename in local file headers", async () => {
    const result = await buildBundle(SAMPLE_REQUEST);
    const str = result.toString("latin1");
    expect(str).toContain("README.txt");
  });

  it("zip central directory lists exactly three entries", async () => {
    // Scan the buffer for ZIP local file header signatures (PK\x03\x04).
    // Each local file header corresponds to one zip entry.
    const result = await buildBundle(SAMPLE_REQUEST);
    const SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    let count = 0;
    for (let i = 0; i <= result.length - 4; i++) {
      if (
        result[i] === SIG[0] &&
        result[i + 1] === SIG[1] &&
        result[i + 2] === SIG[2] &&
        result[i + 3] === SIG[3]
      ) {
        count++;
      }
    }
    expect(count).toBe(3);
  });
});
