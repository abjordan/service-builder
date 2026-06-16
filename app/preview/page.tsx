"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ServicePlan } from "@/lib/service-plan";
import type { PreviewResponse } from "./types";
import { PREVIEW_SESSION_KEY } from "./types";
import { SlideGrid } from "@/app/_components/SlideGrid";
import { StepIndicator } from "@/app/_components/StepIndicator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PreviewState = "idle" | "loading" | "done" | "error";
type BuildState = "idle" | "building" | "done" | "error";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  );
}

function SpinnerWhite() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

// ---------------------------------------------------------------------------
// Rough slide count estimator (for progress message only)
// ---------------------------------------------------------------------------

function estimateSlideCount(plan: ServicePlan): number {
  let count = 0;
  for (const section of plan.sections) {
    if (section.includeInSlides === false) continue;
    switch (section.kind) {
      case "header":
        count += 1;
        break;
      case "liturgy":
        if (section.title) count += 1;
        count += section.items.filter((i) => i.kind === "spoken").length;
        break;
      case "song":
        count += 3; // rough average
        break;
      case "reading":
        count += 1;
        break;
      case "note":
        break;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Default extract path helper
// ---------------------------------------------------------------------------

function defaultExtractPath(serviceDate: string): string {
  return `/Users/op/Desktop/service-builder/${serviceDate}`;
}

// ---------------------------------------------------------------------------
// Inner component — uses useSearchParams, must be wrapped in Suspense
// ---------------------------------------------------------------------------

function PreviewPageInner() {
  const searchParams = useSearchParams();
  const fromEditor = searchParams.get("from") === "editor";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewState, setPreviewState] = useState<PreviewState>(
    fromEditor ? "loading" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [slideCount, setSlideCount] = useState<number | null>(null);

  // The ServicePlan is kept in state so the Build button can POST it.
  const [plan, setPlan] = useState<ServicePlan | null>(null);

  // Build bundle state
  const [buildState, setBuildState] = useState<BuildState>("idle");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [extractPath, setExtractPath] = useState<string>("");

  // -------------------------------------------------------------------------
  // On mount: if coming from editor, read sessionStorage and trigger render
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!fromEditor) return;

    const raw = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (!raw) {
      setError("No plan data found in session. Return to the editor and try again.");
      setPreviewState("error");
      return;
    }

    let parsed: ServicePlan;
    try {
      parsed = JSON.parse(raw) as ServicePlan;
    } catch {
      setError("Session data was corrupted. Return to the editor and try again.");
      setPreviewState("error");
      return;
    }

    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    void submitPlan(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Submit plan to preview API
  // -------------------------------------------------------------------------

  async function submitPlan(submitted: ServicePlan) {
    setPreviewState("loading");
    setError(null);
    setResult(null);
    setBuildState("idle");
    setBuildError(null);

    const rough = estimateSlideCount(submitted);
    setSlideCount(rough);

    // Seed extract path with the service date once we have the plan.
    if (!extractPath && submitted.metadata?.serviceDate) {
      setExtractPath(defaultExtractPath(submitted.metadata.serviceDate));
    }

    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitted),
      });

      const json = (await res.json()) as PreviewResponse | { error: string };

      if (!res.ok || "error" in json) {
        setError("error" in json ? json.error : `Server error ${res.status}`);
        setPreviewState("error");
        return;
      }

      setPlan(submitted);
      setResult(json as PreviewResponse);
      setSlideCount((json as PreviewResponse).totalSlides);
      setPreviewState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPreviewState("error");
    }
  }

  // -------------------------------------------------------------------------
  // File input handler
  // -------------------------------------------------------------------------

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    let parsed: ServicePlan;
    try {
      const text = await file.text();
      parsed = JSON.parse(text) as ServicePlan;
    } catch {
      setError("Could not parse the selected file as JSON.");
      setPreviewState("error");
      return;
    }

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      setError("The file does not look like a service plan (missing sections array).");
      setPreviewState("error");
      return;
    }

    await submitPlan(parsed);
  }

  function handleReset() {
    setPreviewState("idle");
    setError(null);
    setResult(null);
    setSlideCount(null);
    setPlan(null);
    setBuildState("idle");
    setBuildError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // -------------------------------------------------------------------------
  // Build OBS bundle
  // -------------------------------------------------------------------------

  async function handleBuild() {
    if (!plan) return;

    setBuildState("building");
    setBuildError(null);

    try {
      const params = new URLSearchParams();
      const resolvedPath = extractPath.trim() || defaultExtractPath(plan.metadata.serviceDate);
      params.set("extractPath", resolvedPath);

      const res = await fetch(`/api/build?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });

      if (!res.ok) {
        let message = `Server error ${res.status}`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          // ignore JSON parse error on error response
        }
        setBuildError(message);
        setBuildState("error");
        return;
      }

      // Trigger browser download from the zip response.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `${plan.metadata.serviceDate}-bundle.zip`;

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      setBuildState("done");
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Network error");
      setBuildState("error");
    }
  }

  // -------------------------------------------------------------------------
  // Build panel — shown once preview is done
  // -------------------------------------------------------------------------

  const buildPanelVisible = previewState === "done" && plan !== null;

  const isBuilding = buildState === "building";
  const isBuildDone = buildState === "done";

  // -------------------------------------------------------------------------
  // Step to show in the stepper
  // -------------------------------------------------------------------------

  const stepIndicatorStep: "preview" | "build" =
    buildState === "done" ? "build" : "preview";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <StepIndicator current={stepIndicatorStep} />

      {/* Load zone — only shown when not coming from editor or after reset */}
      {!fromEditor && previewState === "idle" && (
        <section className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Load Plan
          </h2>
          <label
            htmlFor="plan-file"
            className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg px-6 py-10 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <span className="text-gray-500 text-sm">
              Click to select a plan <code className="font-mono">.json</code> file
            </span>
            <span className="text-xs text-gray-400 mt-1">
              (the JSON downloaded from the editor)
            </span>
            <input
              id="plan-file"
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        </section>
      )}

      {/* Loading state */}
      {previewState === "loading" && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-6 py-8 mb-8">
          <Spinner />
          <p className="text-sm text-gray-600">
            Rendering{slideCount !== null ? ` ${slideCount}` : ""} slides&hellip; this may
            take a moment.
          </p>
        </div>
      )}

      {/* Error state */}
      {previewState === "error" && error && (
        <div className="mb-8">
          <p className="text-sm text-red-600 border border-red-200 rounded-lg px-4 py-3 bg-red-50">
            {error}
          </p>
          <button
            onClick={handleReset}
            className="mt-3 px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {previewState === "done" && result && (
        <div>
          <div className="flex justify-end mb-6">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 rounded hover:bg-gray-50"
            >
              Load another plan
            </button>
          </div>
          <SlideGrid slides={result.slides} warnings={result.warnings} />
          {buildPanelVisible && (
            <div className="mt-10 border-t border-gray-200 pt-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Build OBS Bundle
              </h2>

              <div className="mb-4">
                <label htmlFor="extract-path" className="block text-sm font-medium text-gray-700 mb-1">
                  Extract path on OBS machine
                </label>
                <input
                  id="extract-path"
                  type="text"
                  value={extractPath}
                  onChange={(e) => setExtractPath(e.target.value)}
                  disabled={isBuilding}
                  placeholder={plan ? defaultExtractPath(plan.metadata.serviceDate) : "/absolute/path"}
                  className="w-full font-mono text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400">
                  OBS needs an absolute path on disk. Extract the downloaded zip to exactly this
                  location, then import scene_collection.json via OBS &gt; Scene Collection &gt; Import.
                </p>
              </div>

              <button
                onClick={handleBuild}
                disabled={isBuilding || previewState !== "done"}
                className={[
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded text-sm font-medium transition-colors",
                  isBuilding || previewState !== "done"
                    ? "bg-blue-300 text-white cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white",
                ].join(" ")}
              >
                {isBuilding ? (
                  <>
                    <SpinnerWhite />
                    Building bundle&hellip;
                  </>
                ) : isBuildDone ? (
                  "Download again"
                ) : (
                  "Build OBS Bundle"
                )}
              </button>

              {isBuildDone && (
                <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                  Bundle downloaded. Extract to{" "}
                  <code className="font-mono text-xs">{extractPath || (plan ? defaultExtractPath(plan.metadata.serviceDate) : "")}</code>{" "}
                  and import scene_collection.json into OBS.
                </p>
              )}

              {buildState === "error" && buildError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Build failed: {buildError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page shell — wraps inner in Suspense (required by Next.js for useSearchParams)
// ---------------------------------------------------------------------------

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Service Builder &mdash; Preview
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review the rendered slide deck before building the OBS bundle.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium mt-1 whitespace-nowrap"
        >
          Open editor &rarr;
        </Link>
      </header>

      <Suspense
        fallback={
          <div className="max-w-6xl mx-auto px-6 py-8">
            <p className="text-sm text-gray-500">Loading&hellip;</p>
          </div>
        }
      >
        <PreviewPageInner />
      </Suspense>
    </div>
  );
}
