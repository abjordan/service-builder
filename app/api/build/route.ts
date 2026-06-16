/**
 * POST /api/build
 *
 * Dual-dispatch:
 *   - Body has `metadata` + `sections` array → ServicePlan path.
 *     Calls buildServicePlanBundle and returns a zip named {serviceDate}-bundle.zip.
 *     Optional query parameter: ?extractPath=/absolute/path
 *     Defaults to /tmp/service-builder-output when omitted.
 *
 *   - Otherwise → Stage1BuildRequest validation path (back-compat).
 *
 * Runs in the Node.js runtime because archiver and @resvg/resvg-js are Node-only.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildBundle, buildServicePlanBundle } from "@/lib/build-bundle";
import type { Stage1BuildRequest, ServicePlanBuildOptions } from "@/lib/build-bundle";
import type { ServicePlan } from "@/lib/service-plan";

const DEFAULT_EXTRACT_PATH = "/tmp/service-builder-output";

// ---------------------------------------------------------------------------
// Shape sniffers
// ---------------------------------------------------------------------------

function isServicePlan(body: unknown): body is ServicePlan {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.metadata === "object" &&
    b.metadata !== null &&
    Array.isArray(b.sections)
  );
}

function isStage1Request(body: unknown): body is Stage1BuildRequest {
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, "_").trim() || "bundle";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- ServicePlan path ---
  if (isServicePlan(body)) {
    const plan = body;

    // Optional ?extractPath= query param.
    const extractPath =
      req.nextUrl.searchParams.get("extractPath") ?? DEFAULT_EXTRACT_PATH;

    const collectionName = `${plan.metadata.serviceDate} Livestream`;

    const buildOpts: ServicePlanBuildOptions = {
      obsExtractPath: extractPath,
      collectionName,
    };

    let zipBuffer: Buffer;
    try {
      zipBuffer = await buildServicePlanBundle(plan, buildOpts);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Build failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const filename = `${sanitizeFilename(plan.metadata.serviceDate)}-bundle.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.byteLength),
      },
    });
  }

  // --- Stage 1 back-compat path ---
  if (!isStage1Request(body)) {
    return NextResponse.json(
      {
        error:
          "Invalid request. Send a ServicePlan (with metadata + sections) for a full bundle, " +
          "or a Stage1BuildRequest (collectionName, sceneName, obsExtractPath, slide) for a single-slide bundle.",
      },
      { status: 400 }
    );
  }

  const zipBuffer = await buildBundle(body);
  const filename = `${sanitizeFilename(body.collectionName)}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
