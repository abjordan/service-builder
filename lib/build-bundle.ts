/**
 * Build helpers — assembles zip bundles in memory.
 * No filesystem writes; all I/O is caller's responsibility.
 *
 * buildBundle         — Stage 1 path (single hymn-verse slide, one scene).
 * buildServicePlanBundle — full ServicePlan path (all slides, one scene each).
 */

import fs from "fs";
import path from "path";
import { PassThrough } from "stream";
import archiver from "archiver";
import { renderSlide } from "./render-slide";
import type { HymnVerseSlide } from "./render-slide";
import { emitSceneCollection } from "./emit-scene-collection";
import type { SceneCollection } from "./emit-scene-collection";
import type { ServicePlan } from "./service-plan";
import { expandPlan } from "./expand-plan";
import { readLibrary } from "./hymn-library";
import {
  groupSlidesIntoSceneSpecs,
  spliceContentScenes,
} from "./assemble-collection";

// The base scene collection (broadcast infrastructure + static bookend scenes)
// that generated content scenes are spliced into. Loaded once per process.
const BASE_TEMPLATE_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "base-template.json",
);

let _baseTemplate: SceneCollection | undefined;
function loadBaseTemplate(): SceneCollection {
  if (!_baseTemplate) {
    _baseTemplate = JSON.parse(
      fs.readFileSync(BASE_TEMPLATE_PATH, "utf-8"),
    ) as SceneCollection;
  }
  return _baseTemplate;
}

export type Stage1BuildRequest = {
  collectionName: string;
  sceneName: string;
  slide: HymnVerseSlide;
  /**
   * The absolute path on the OBS operator's machine where the zip will be
   * extracted. OBS slideshow sources require absolute paths, so we bake this in.
   */
  obsExtractPath: string;
};

/**
 * Assembles a Stage 1 zip bundle and returns it as a Buffer.
 * Does NOT touch the filesystem.
 */
export async function buildBundle(req: Stage1BuildRequest): Promise<Buffer> {
  const { collectionName, sceneName, slide, obsExtractPath } = req;

  // 1. Render the PNG.
  const pngBuffer = await renderSlide(slide);

  // 2. Compute the absolute slide path baked into the OBS scene collection.
  //    POSIX join even on Windows hosts — OBS accepts forward slashes everywhere.
  const slideAbsolutePath = path.posix.join(obsExtractPath, "assets/slide.png");

  // 3. Emit the scene collection JSON.
  const sceneCollection = emitSceneCollection({
    collectionName,
    sceneName,
    slideAbsolutePath,
  });
  const sceneCollectionJson = JSON.stringify(sceneCollection, null, 2);

  // 4. Build the README.
  const readme = [
    "Service Builder — Stage 1 Bundle",
    "",
    "This zip MUST be extracted to:",
    `  ${obsExtractPath}`,
    "",
    "The scene_collection.json references slides by absolute path. If you",
    "extract it elsewhere, OBS will not find the images.",
    "",
    "To import: open OBS → Scene Collection → Import → select scene_collection.json",
  ].join("\n");

  // 5. Assemble zip in memory using archiver + PassThrough stream.
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));
    passThrough.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    archive.pipe(passThrough);

    archive.append(sceneCollectionJson, { name: "scene_collection.json" });
    archive.append(pngBuffer, { name: "assets/slide.png" });
    archive.append(readme, { name: "README.txt" });

    archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Full ServicePlan bundle
// ---------------------------------------------------------------------------

export type ServicePlanBuildOptions = {
  /**
   * Absolute path on the OBS operator's machine where the zip will be
   * extracted. OBS image sources require absolute paths.
   */
  obsExtractPath: string;
  /**
   * Name for the OBS scene collection (visible in OBS's Scene Collection menu).
   * Defaults to "{serviceDate} Livestream".
   */
  collectionName?: string;
};

/**
 * Replace any character that is not alphanumeric, hyphen, or underscore with a
 * hyphen so the string is safe to embed in a filename or OBS source name.
 */
function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Zero-pad n to at least 2 digits.
 */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Assembles a full ServicePlan zip bundle and returns it as a Buffer.
 * Does NOT touch the filesystem.
 *
 * Pipeline:
 *   1. Load hymn library.
 *   2. Expand the plan via expandPlan.
 *   3. Render each slide sequentially (satori is CPU-bound).
 *   4. Name PNGs: assets/{NN}-{slide.id}.png
 *   5. Group slides into per-section content scenes and splice them into the
 *      base template (shared camera/audio + static bookend scenes).
 *   6. Bundle everything into a zip with a README.
 */
export async function buildServicePlanBundle(
  plan: ServicePlan,
  opts: ServicePlanBuildOptions,
): Promise<Buffer> {
  const { obsExtractPath } = opts;
  const collectionName =
    opts.collectionName ??
    `${plan.metadata.serviceDate} Livestream`;

  // Everything nests under a dated top-level directory, matching the OBS
  // worship-folder layout (e.g. .../Worship/2026-06-14/...). Extracting the zip
  // at obsExtractPath therefore creates obsExtractPath/<date>/, which is exactly
  // the prefix baked into each slideshow's absolute path below.
  const bundleDir = sanitizeId(plan.metadata.serviceDate);

  // 1. Load library and expand plan.
  const library = readLibrary();
  const { slides: expandedSlides, warnings } = expandPlan(plan, { library });

  if (expandedSlides.length === 0) {
    throw new Error("buildServicePlanBundle: plan expanded to zero slides");
  }

  // 2. Render each slide sequentially; collect PNGs + metadata.
  type RenderedSlide = {
    filename: string; // e.g. "assets/01-s0-hymn-0.png"
    absPath: string;  // full path baked into OBS scene
    label: string;    // scene name in OBS
    png: Buffer;
  };

  const rendered: RenderedSlide[] = [];

  for (let i = 0; i < expandedSlides.length; i++) {
    const expanded = expandedSlides[i];
    const nn = pad(i + 1);
    const safeId = sanitizeId(expanded.id);
    const filename = `assets/${nn}-${safeId}.png`;
    const absPath = path.posix.join(obsExtractPath, bundleDir, filename);
    const label = expanded.label ?? expanded.id;

    const png = await renderSlide(expanded.slide);

    rendered.push({ filename, absPath, label, png });
  }

  // 3. Group rendered slides into per-section content scenes and splice them
  //    into the base template (camera/audio/bookends), in plan order.
  //    `rendered` is index-aligned with `expandedSlides`.
  const sceneSpecs = groupSlidesIntoSceneSpecs(
    plan,
    expandedSlides,
    (_slide, i) => rendered[i].absPath,
  );
  const sceneCollection = spliceContentScenes(loadBaseTemplate(), sceneSpecs, {
    collectionName,
  });
  const sceneCollectionJson = JSON.stringify(sceneCollection, null, 2);

  // 4. Build README.
  const warningLines =
    warnings.length > 0
      ? [
          "",
          `Warnings (${warnings.length}):`,
          ...warnings.map((w) => `  [section ${w.sectionIndex}] ${w.message}`),
        ]
      : [];

  const sceneIndex = sceneSpecs.map(
    (s, i) => `  ${pad(i + 1)}. ${s.name} (${s.imagePaths.length} slide${s.imagePaths.length !== 1 ? "s" : ""})`,
  );

  const readme = [
    `Service Builder — OBS Bundle`,
    `Service: ${plan.metadata.serviceDate}  ${plan.metadata.liturgicalDay}`,
    "",
    "IMPORTANT: Extract this zip to EXACTLY the following path:",
    `  ${obsExtractPath}`,
    "",
    `The zip contains a "${bundleDir}" folder, so extracting here produces:`,
    `  ${path.posix.join(obsExtractPath, bundleDir)}`,
    "",
    "OBS slideshow sources reference slides by absolute path. If you extract",
    "the zip to a different location, OBS will show broken sources.",
    "",
    "To import the scene collection into OBS:",
    "  1. Extract this zip to the path shown above.",
    "  2. Open OBS.",
    "  3. Scene Collection menu > Import.",
    `  4. Select: ${bundleDir}/scene_collection.json (in the extracted folder).`,
    "  5. Switch to the imported collection.",
    "",
    "The collection keeps your base scenes (Intro, Welcome, Thanks, Outro,",
    "camera, audio) and adds one content scene per section between Welcome",
    "and Thanks. Each content scene plays its slides as a manual slideshow —",
    "advance with the slideshow's next-slide control.",
    "",
    `Generated content scenes (${sceneSpecs.length}, in order):`,
    ...sceneIndex,
    ...warningLines,
  ].join("\n");

  // 5. Assemble zip in memory.
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(chunks)));
    passThrough.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    archive.pipe(passThrough);

    archive.append(sceneCollectionJson, {
      name: `${bundleDir}/scene_collection.json`,
    });
    for (const r of rendered) {
      archive.append(r.png, { name: `${bundleDir}/${r.filename}` });
    }
    archive.append(readme, { name: `${bundleDir}/README.txt` });

    archive.finalize();
  });
}
