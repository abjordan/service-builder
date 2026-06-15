"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ServicePlan } from "@/lib/service-plan";
import type { PreviewResponse } from "./types";
import { PREVIEW_SESSION_KEY } from "./types";
import { SlideGrid } from "@/app/_components/SlideGrid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PreviewState = "idle" | "loading" | "done" | "error";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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

    let plan: ServicePlan;
    try {
      plan = JSON.parse(raw) as ServicePlan;
    } catch {
      setError("Session data was corrupted. Return to the editor and try again.");
      setPreviewState("error");
      return;
    }

    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    void submitPlan(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Submit plan to API
  // -------------------------------------------------------------------------

  async function submitPlan(plan: ServicePlan) {
    setPreviewState("loading");
    setError(null);
    setResult(null);

    const rough = estimateSlideCount(plan);
    setSlideCount(rough);

    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });

      const json = (await res.json()) as PreviewResponse | { error: string };

      if (!res.ok || "error" in json) {
        setError("error" in json ? json.error : `Server error ${res.status}`);
        setPreviewState("error");
        return;
      }

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

    let plan: ServicePlan;
    try {
      const text = await file.text();
      plan = JSON.parse(text) as ServicePlan;
    } catch {
      setError("Could not parse the selected file as JSON.");
      setPreviewState("error");
      return;
    }

    if (!plan.sections || !Array.isArray(plan.sections)) {
      setError("The file does not look like a service plan (missing sections array).");
      setPreviewState("error");
      return;
    }

    await submitPlan(plan);
  }

  function handleReset() {
    setPreviewState("idle");
    setError(null);
    setResult(null);
    setSlideCount(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
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
            Service Builder &mdash; Stage 3: Deck Preview
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Load a service plan JSON to see the rendered slide deck.
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
