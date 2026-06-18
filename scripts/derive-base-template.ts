/**
 * Regenerates lib/base-template.json from the hand-built reference scene
 * collection. The base template is the broadcast infrastructure + static
 * bookend scenes that every week's bundle is spliced into (Stage 5).
 *
 * Re-run this if the reference collection changes:
 *   npm run derive:base-template
 */

import fs from "fs";
import path from "path";
import { deriveBaseTemplate } from "../lib/derive-base-template";
import type { SceneCollection } from "../lib/emit-scene-collection";

const REF_PATH = path.join(
  __dirname,
  "../examples/20260614/20260614.json",
);
const OUT_PATH = path.join(__dirname, "../lib/base-template.json");

const ref = JSON.parse(fs.readFileSync(REF_PATH, "utf-8")) as SceneCollection;
const base = deriveBaseTemplate(ref);

fs.writeFileSync(OUT_PATH, JSON.stringify(base, null, 2) + "\n", "utf-8");

const sceneCount = ((base.sources as { id?: string }[]) ?? []).filter(
  (s) => s.id === "scene",
).length;
const sourceCount = ((base.sources as unknown[]) ?? []).length;
console.log(
  `Wrote ${path.relative(process.cwd(), OUT_PATH)} — ${sceneCount} scenes, ${sourceCount} sources.`,
);
