// Re-parse the example bulletin PDF and write the new plan to out/, then
// dump the Psalm section so we can verify per-verse splitting and P/C
// assignment after the font-based fix.

import fs from "fs";
import path from "path";
import { parseBulletin } from "../lib/parse-bulletin";

const PDF = path.join(
  process.cwd(),
  "examples/20260614/2026-06-14 Third Sunday after Pentecost - Livestream.pdf",
);
const OUT = path.join(process.cwd(), "out", "2026-06-14-plan.json");

async function main(): Promise<void> {
  const buf = fs.readFileSync(PDF);
  const { plan, warnings } = await parseBulletin(buf);
  fs.writeFileSync(OUT, JSON.stringify(plan, null, 2));
  console.log(`Wrote ${OUT}, sections=${plan.sections.length}, warnings=${warnings.length}`);

  for (const w of warnings.slice(0, 8)) {
    console.log(`  WARN ${w.severity}: ${w.message}`);
  }

  for (const [i, s] of plan.sections.entries()) {
    const t = s.kind === "liturgy" || s.kind === "reading" || s.kind === "header" || s.kind === "song" || s.kind === "note" ? s.title ?? "" : "";
    if (/psalm|introit/i.test(t ?? "")) {
      console.log(`\n--- Section ${i} (${s.kind}) "${t}" ---`);
      if (s.kind === "liturgy") {
        for (const it of s.items) {
          const sp = it.kind === "spoken" ? it.speaker : "·";
          console.log(`  ${it.kind.padEnd(7)} ${sp.padEnd(2)} ${it.text.slice(0, 100)}`);
        }
      }
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
