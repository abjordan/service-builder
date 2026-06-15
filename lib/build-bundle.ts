/**
 * Stage 1 build helper — assembles a zip bundle in memory.
 * No filesystem writes; all I/O is caller's responsibility.
 */

import path from "path";
import { PassThrough } from "stream";
import archiver from "archiver";
import { renderSlide } from "./render-slide";
import type { HymnVerseSlide } from "./render-slide";
import { emitSceneCollection } from "./emit-scene-collection";

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
