/**
 * POST /api/parse
 * Accepts multipart/form-data with a "file" field (the bulletin PDF).
 * Returns JSON ParseResult on success, or { error } on failure.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { parseBulletin } from "@/lib/parse-bulletin";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file field in request" }, { status: 400 });
  }

  // Validate PDF magic bytes
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  // PDF files start with %PDF
  if (
    bytes[0] !== 0x25 || // %
    bytes[1] !== 0x50 || // P
    bytes[2] !== 0x44 || // D
    bytes[3] !== 0x46    // F
  ) {
    return NextResponse.json({ error: "File does not appear to be a PDF" }, { status: 400 });
  }

  const result = await parseBulletin(bytes);
  return NextResponse.json(result, { status: 200 });
}
