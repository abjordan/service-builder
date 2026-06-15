/**
 * POST /api/build
 * Accepts a Stage1BuildRequest JSON body, assembles the zip bundle,
 * and returns it as a downloadable zip file.
 *
 * Runs in the Node.js runtime because archiver and @resvg/resvg-js are Node-only.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildBundle } from "@/lib/build-bundle";
import type { Stage1BuildRequest } from "@/lib/build-bundle";

function sanitizeFilename(name: string): string {
  // Replace characters unsafe in filenames with underscores.
  return name.replace(/[^a-zA-Z0-9._\- ]/g, "_").trim() || "bundle";
}

function validateRequest(body: unknown): body is Stage1BuildRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  if (typeof b.collectionName !== "string" || b.collectionName.trim() === "") return false;
  if (typeof b.sceneName !== "string" || b.sceneName.trim() === "") return false;
  if (typeof b.obsExtractPath !== "string" || b.obsExtractPath.trim() === "") return false;

  const slide = b.slide;
  if (typeof slide !== "object" || slide === null) return false;
  const s = slide as Record<string, unknown>;
  if (s.kind !== "hymn-verse") return false;
  if (typeof s.hymnTitle !== "string" || s.hymnTitle.trim() === "") return false;
  if (typeof s.verseNumber !== "number") return false;
  if (!Array.isArray(s.lines)) return false;
  if (s.hymnNumber !== undefined && typeof s.hymnNumber !== "string") return false;

  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!validateRequest(body)) {
    return NextResponse.json(
      {
        error:
          "Invalid request. Required fields: collectionName (string), sceneName (string), " +
          "obsExtractPath (string), slide.kind ('hymn-verse'), slide.hymnTitle (string), " +
          "slide.verseNumber (number), slide.lines (array).",
      },
      { status: 400 }
    );
  }

  const zipBuffer = await buildBundle(body);

  const filename = `${sanitizeFilename(body.collectionName)}.zip`;

  // NextResponse body must be BodyInit. Convert Node Buffer → Uint8Array.
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
