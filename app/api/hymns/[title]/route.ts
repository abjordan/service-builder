/**
 * DELETE /api/hymns/[title] — remove a hymn by title (URL-encoded).
 *   Returns { deleted: title } on success, { error } 404 if not found.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { readLibrary, writeLibrary, deleteHymnByTitle } from "@/lib/hymn-library";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ title: string }> }
): Promise<NextResponse> {
  const { title } = await params;
  const decoded = decodeURIComponent(title);

  try {
    const lib = readLibrary();
    const { library, removed } = deleteHymnByTitle(lib, decoded);
    if (!removed) {
      return NextResponse.json({ error: `Hymn not found: ${decoded}` }, { status: 404 });
    }
    writeLibrary(library);
    return NextResponse.json({ deleted: decoded }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete hymn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
