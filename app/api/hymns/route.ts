/**
 * GET /api/hymns — return the full hymn library as JSON.
 * POST /api/hymns — create or update a hymn by title. Body must be a valid Hymn
 *   (title: string, slides: { tag: string, lines: string[] }[], authors?: string).
 *   Responds with the saved hymn (id is always the slugified title).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readLibrary, writeLibrary, upsertHymn, slugify } from "@/lib/hymn-library";
import type { Hymn } from "@/lib/hymn-library";

function isValidHymnBody(body: unknown): body is Omit<Hymn, "id"> & { id?: string } {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || b.title.trim() === "") return false;
  if (!Array.isArray(b.slides)) return false;
  for (const slide of b.slides) {
    if (typeof slide !== "object" || slide === null) return false;
    const s = slide as Record<string, unknown>;
    if (typeof s.tag !== "string") return false;
    if (!Array.isArray(s.lines)) return false;
    if (s.lines.some((l) => typeof l !== "string")) return false;
    if (s.startNewSlide !== undefined && typeof s.startNewSlide !== "boolean") return false;
  }
  if (b.authors !== undefined && typeof b.authors !== "string") return false;
  if (b.copyright !== undefined && typeof b.copyright !== "string") return false;
  return true;
}

export async function GET(): Promise<NextResponse> {
  try {
    const lib = readLibrary();
    return NextResponse.json(lib, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read hymn library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidHymnBody(body)) {
    return NextResponse.json(
      {
        error:
          "Invalid hymn. Required: title (non-empty string), slides (array of { tag: string, lines: string[] }). Optional: authors (string).",
      },
      { status: 400 }
    );
  }

  try {
    const hymn: Hymn = { id: "", ...body };
    const lib = readLibrary();
    writeLibrary(upsertHymn(lib, hymn));
    const saved: Hymn = { ...hymn, id: slugify(hymn.title) };
    return NextResponse.json(saved, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save hymn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
