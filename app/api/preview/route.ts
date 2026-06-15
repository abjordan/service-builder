// POST /api/preview
//
// Accepts a ServicePlan JSON body, expands it to slides, renders each slide to
// PNG, and returns the full deck as base64 data URLs.
//
// Slides are rendered SEQUENTIALLY — satori is CPU-bound and parallelizing
// would blow memory on a 49-slide deck.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { ServicePlan } from "@/lib/service-plan";
import { expandPlan } from "@/lib/expand-plan";
import { readLibrary } from "@/lib/hymn-library";
import { renderSlide } from "@/lib/render-slide";
import type { PreviewResponse, PreviewSlide } from "@/app/preview/types";

export async function POST(req: NextRequest) {
  // 1. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body === null ||
    typeof body !== "object" ||
    !("sections" in body) ||
    !Array.isArray((body as Record<string, unknown>).sections)
  ) {
    return NextResponse.json(
      { error: "Body must be a ServicePlan with a sections array" },
      { status: 400 },
    );
  }

  const plan = body as ServicePlan;

  // 2. Load hymn library
  const library = readLibrary();

  // 3. Expand plan to slides
  const { slides: expandedSlides, warnings } = expandPlan(plan, { library });

  // 4. Render slides sequentially
  const slides: PreviewSlide[] = [];
  for (const expanded of expandedSlides) {
    const pngBuffer = await renderSlide(expanded.slide);
    const base64 = pngBuffer.toString("base64");
    slides.push({
      id: expanded.id,
      label: expanded.label ?? expanded.id,
      kind: expanded.slide.kind,
      sectionIndex: expanded.sectionIndex,
      png: `data:image/png;base64,${base64}`,
    });
  }

  const response: PreviewResponse = {
    slides,
    warnings,
    totalSlides: slides.length,
  };

  return NextResponse.json(response);
}
