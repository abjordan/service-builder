/**
 * Build helpers — assembles zip bundles in memory.
 * No filesystem writes; all I/O is caller's responsibility.
 *
 * buildBundle         — Stage 1 path (single hymn-verse slide, one scene).
 * buildServicePlanBundle — full ServicePlan path (all slides, one scene each).
 */

import path from "path";
import { PassThrough } from "stream";
import archiver from "archiver";
import { renderSlide } from "./render-slide";
import type { HymnVerseSlide } from "./render-slide";
import { emitSceneCollection, emitMultiSceneCollection } from "./emit-scene-collection";
import type { ServicePlan } from "./service-plan";
import { expandPlan } from "./expand-plan";
import { readLibrary } from "./hymn-library";

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
 *   5. Emit a multi-scene OBS collection (one scene per slide).
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
    const absPath = path.posix.join(obsExtractPath, filename);
    const label = expanded.label ?? expanded.id;

    const png = await renderSlide(expanded.slide);

    rendered.push({ filename, absPath, label, png });
  }

  // 3. Emit multi-scene collection.
  const sceneSpecs = rendered.map((r) => ({ name: r.label, imagePath: r.absPath }));
  const sceneCollection = emitMultiSceneCollection(collectionName, sceneSpecs);
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

  const slideIndex = rendered.map(
    (r, i) => `  ${pad(i + 1)}. ${r.label}`,
  );

  const readme = [
    `Service Builder — OBS Bundle`,
    `Service: ${plan.metadata.serviceDate}  ${plan.metadata.liturgicalDay}`,
    "",
    "IMPORTANT: Extract this zip to EXACTLY the following path:",
    `  ${obsExtractPath}`,
    "",
    "OBS image sources reference slides by absolute path. If you extract",
    "the zip to a different location, OBS will show broken image sources.",
    "",
    "To import the scene collection into OBS:",
    "  1. Extract this zip to the path shown above.",
    "  2. Open OBS.",
    "  3. Scene Collection menu > Import.",
    "  4. Select: scene_collection.json (from the extracted folder).",
    "  5. Switch to the imported collection.",
    "",
    "Advance through the service by clicking each scene in OBS's Scene panel",
    "in order. The scenes are pre-named to match the order of service.",
    "",
    `Slides in this bundle (${rendered.length} total):`,
    ...slideIndex,
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

    archive.append(sceneCollectionJson, { name: "scene_collection.json" });
    for (const r of rendered) {
      archive.append(r.png, { name: r.filename });
    }
    archive.append(readme, { name: "README.txt" });

    archive.finalize();
  });
}
