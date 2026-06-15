/**
 * CLI script for Stage 1 smoke testing.
 * Calls buildBundle with a hard-coded sample, writes the zip to ./out/,
 * and also writes the raw JSON + PNG alongside the zip for easy inspection
 * without needing to unzip manually.
 *
 * Choice: rather than extracting the zip (which would require a zip-reading
 * dep), we call the building primitives a second time (renderSlide + emitSceneCollection)
 * and write those outputs directly. It's slightly wasteful but keeps zero new deps.
 *
 * Usage: npm run build:stage1
 */

import fs from "fs";
import path from "path";
import { buildBundle } from "../lib/build-bundle";
import { renderSlide } from "../lib/render-slide";
import { emitSceneCollection } from "../lib/emit-scene-collection";

const COLLECTION_NAME = "Stage 1 Smoke Test";
const SCENE_NAME = "Test Hymn";
const OUT_DIR = path.join(process.cwd(), "out");
const OBS_EXTRACT_PATH = path.join(OUT_DIR, COLLECTION_NAME);

const REQUEST = {
  collectionName: COLLECTION_NAME,
  sceneName: SCENE_NAME,
  slide: {
    kind: "hymn-verse" as const,
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
  obsExtractPath: OBS_EXTRACT_PATH,
};

async function main(): Promise<void> {
  // Ensure output directories exist.
  const inspectDir = path.join(OUT_DIR, COLLECTION_NAME, "assets");
  fs.mkdirSync(inspectDir, { recursive: true });

  // 1. Build the zip bundle.
  console.log("Building zip bundle…");
  const zipBuffer = await buildBundle(REQUEST);

  const zipPath = path.join(OUT_DIR, `${COLLECTION_NAME}.zip`);
  fs.writeFileSync(zipPath, zipBuffer);
  console.log(`Zip written to: ${zipPath}`);
  console.log(`Zip byte size:  ${zipBuffer.byteLength.toLocaleString()} bytes`);

  // 2. Write inspection artifacts alongside the zip (no unzipping needed).
  console.log("\nWriting inspection artifacts…");

  // JSON
  const collection = emitSceneCollection({
    collectionName: COLLECTION_NAME,
    sceneName: SCENE_NAME,
    slideAbsolutePath: `${OBS_EXTRACT_PATH}/assets/slide.png`,
  });
  const jsonPath = path.join(OUT_DIR, COLLECTION_NAME, "scene_collection.json");
  fs.writeFileSync(jsonPath, JSON.stringify(collection, null, 2));
  console.log(`  JSON: ${jsonPath}`);

  // PNG
  const pngBuffer = await renderSlide(REQUEST.slide);
  const pngPath = path.join(OUT_DIR, COLLECTION_NAME, "assets", "slide.png");
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`  PNG:  ${pngPath} (${pngBuffer.byteLength.toLocaleString()} bytes)`);

  console.log("\nDone.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
