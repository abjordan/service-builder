/**
 * Snapshot render test — renders one slide of each kind and writes PNGs to
 * out/stage3-preview/<kind>.png for manual visual inspection.
 *
 * Skipped by default (set RENDER_PREVIEW=1 to enable).
 *
 * Usage:
 *   RENDER_PREVIEW=1 npm test -- --run tests/render-deck-snapshot.test.ts
 */

import { describe, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderSlide } from "../lib/render-slide";
import type { Slide } from "../lib/render-slide";

const ENABLED = process.env["RENDER_PREVIEW"] === "1";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "out", "stage3-preview");

const SLIDES: Array<{ name: string; slide: Slide }> = [
  {
    name: "liturgy-single",
    slide: {
      kind: "liturgy",
      items: [{ speaker: "P", text: "The Lord be with you." }],
    },
  },
  {
    name: "liturgy-paired",
    slide: {
      kind: "liturgy",
      title: "Salutation and Collect of the Day",
      items: [
        { speaker: "P", text: "The Lord be with you." },
        { speaker: "C", text: "And also with you." },
      ],
    },
  },
  {
    name: "liturgy-psalm",
    slide: {
      kind: "liturgy",
      title: "Psalm",
      citation: "Psalm 100",
      items: [
        {
          speaker: "A",
          text: "Make a joyful noise to the LORD, all the earth! Serve the LORD with gladness!",
        },
        {
          speaker: "C",
          text: "Know that the LORD, he is God! It is he who made us, and we are his.",
        },
      ],
    },
  },
  {
    name: "reading-ot",
    slide: {
      kind: "reading",
      title: "Old Testament Reading",
      citation: "Exodus 19:2–8a",
      responseA: "This is the Word of the Lord.",
      responseC: "Thanks be to God.",
    },
  },
  {
    name: "reading-gospel",
    slide: {
      kind: "reading",
      title: "Holy Gospel",
      citation: "Matthew 9:35–10:20",
      responseA: "This is the Gospel of the Lord.",
      responseC: "Praise to You, O Christ.",
    },
  },
  {
    name: "hymn",
    slide: {
      kind: "hymn",
      title: "Everlasting God",
      blocks: [
        {
          tag: "v1",
          lines: [
            "Strength will rise as we wait upon the Lord.",
            "We will wait upon the Lord, we will wait upon the Lord.",
            "Strength will rise as we wait upon the Lord.",
            "We will wait upon the Lord, we will wait upon the Lord.",
            "Jesus, You reign forever;",
            "Our hope, our strong deliverer.",
          ],
        },
      ],
    },
  },
];

describe.skipIf(!ENABLED)("render-deck-snapshot (RENDER_PREVIEW=1)", () => {
  it("creates output directory", () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const { name, slide } of SLIDES) {
    it(`renders ${name}.png`, async () => {
      const buf = await renderSlide(slide);
      const outPath = path.join(OUT_DIR, `${name}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`  wrote ${outPath} (${buf.length} bytes)`);
    });
  }
});
