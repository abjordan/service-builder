/**
 * Builds a full OBS bundle from the example bulletin for manual testing —
 * the same pipeline the Build button runs, but straight to disk so you can
 * import it into OBS without the dev server.
 *
 * Usage:
 *   npm run build:bundle                 # extract path defaults to ./out/<name>
 *   npm run build:bundle -- /abs/path    # bake a specific OBS extract path
 *
 * Writes out/<name>.zip and extracts it to the baked path (so OBS finds the
 * absolute slideshow paths). Then in OBS: Scene Collection > Import >
 * <extract-path>/scene_collection.json
 */

import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";
import { buildServicePlanBundle } from "../lib/build-bundle";
import type { ServicePlan } from "../lib/service-plan";

const PLAN_PATH = path.join(
  process.cwd(),
  "examples",
  "20260614",
  "parsed-plan.json",
);
const OUT_DIR = path.join(process.cwd(), "out");

async function main(): Promise<void> {
  if (!fs.existsSync(PLAN_PATH)) {
    throw new Error(`Example plan not found: ${PLAN_PATH}`);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf-8")) as ServicePlan;

  const name = `${plan.metadata.serviceDate} Livestream (example)`;
  // Where OBS will look for the slides. Override by passing an absolute path.
  const extractPath = process.argv[2] ?? path.join(OUT_DIR, name);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Building bundle for ${plan.metadata.serviceDate}…`);
  const zip = await buildServicePlanBundle(plan, {
    obsExtractPath: extractPath,
    collectionName: name,
  });

  const zipPath = path.join(OUT_DIR, `${name}.zip`);
  fs.writeFileSync(zipPath, zip);
  console.log(`Zip:     ${zipPath} (${zip.byteLength.toLocaleString()} bytes)`);

  // Extract to the baked path so the bundle is import-ready.
  fs.mkdirSync(extractPath, { recursive: true });
  execSync(`unzip -o "${zipPath}" -d "${extractPath}"`, { stdio: "ignore" });
  console.log(`Extracted to: ${extractPath}`);

  console.log("\nIn OBS: Scene Collection > Import > select:");
  console.log(`  ${path.join(extractPath, "scene_collection.json")}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
