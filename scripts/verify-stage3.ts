// One-off Stage 3 visual verification.
// Loads the parsed 2026-06-14 plan, expands it, and writes a representative
// PNG for each slide kind into out/stage3-verify/ so they can be compared
// against the reference PNGs in examples/20260614/.

import fs from "fs";
import path from "path";
import { expandPlan } from "../lib/expand-plan";
import { readLibrary } from "../lib/hymn-library";
import { renderSlide } from "../lib/render-slide";
import type { ServicePlan } from "../lib/service-plan";

const OUT_DIR = path.join(process.cwd(), "out", "stage3-verify");
const PLAN_PATH = path.join(process.cwd(), "out", "2026-06-14-plan.json");

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")) as ServicePlan;
  const library = readLibrary();
  const { slides, warnings } = expandPlan(plan, { library });

  console.log(`Expanded plan: ${slides.length} slides, ${warnings.length} warnings`);

  // Print the deck for visibility.
  for (const s of slides) {
    console.log(`  ${s.id.padEnd(28)} ${s.slide.kind.padEnd(8)} ${s.label ?? ""}`);
  }

  // Find first slide matching each section by sectionIndex, plus first hymn slide.
  type Target = { id?: string; sectionIndex?: number; filename: string };
  const targets: Target[] = [
    { sectionIndex: 4, filename: "01-confession-first.png" },
    { id: "s4-liturgy-4", filename: "01b-confession-mmg-part1.png" },
    { id: "s4-liturgy-5", filename: "01c-confession-mmg-part2.png" },
    { id: "s4-liturgy-6", filename: "01d-confession-absolution.png" },
    { sectionIndex: 7, filename: "02-psalm-first.png" },
    { id: "s7-liturgy-2", filename: "02b-psalm-v3-C-bold.png" },
    { id: "s7-liturgy-3", filename: "02c-psalm-v4-P-regular.png" },
    { sectionIndex: 8, filename: "03-salutation-first.png" },
    { sectionIndex: 9, filename: "04-ot-reading.png" },
    { sectionIndex: 13, filename: "05-gospel-reading.png" },
    { sectionIndex: 3, filename: "06-hymn-everlasting-god.png" },
  ];

  for (const target of targets) {
    const match = target.id
      ? slides.find((s) => s.id === target.id)
      : slides.find((s) => s.sectionIndex === target.sectionIndex);
    if (!match) {
      console.warn(`  (skip) no slide for ${JSON.stringify(target)}`);
      continue;
    }
    const png = await renderSlide(match.slide);
    const outPath = path.join(OUT_DIR, target.filename);
    fs.writeFileSync(outPath, png);
    console.log(`  wrote ${target.filename} (${png.byteLength} bytes, kind=${match.slide.kind})`);
  }

  console.log(`\nDone. Compare against examples/20260614/*.PNG`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
