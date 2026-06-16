"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ServicePlan,
  Section,
  ParseWarning,
  LiturgyBlock,
  Song,
  Reading,
  SectionHeader,
  Note,
} from "@/lib/service-plan";
import { splitLiturgyBlock } from "@/lib/section-utils";
import { WarningsPanel } from "./_components/WarningsPanel";
import { MetadataCard } from "./_components/MetadataCard";
import { SectionCard } from "./_components/SectionCard";
import { StepIndicator } from "./_components/StepIndicator";
import { PREVIEW_SESSION_KEY } from "./preview/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ParseState = "idle" | "loading" | "done" | "error";

// ---------------------------------------------------------------------------
// Empty section factories
// ---------------------------------------------------------------------------

function emptySection(kind: Section["kind"]): Section {
  switch (kind) {
    case "header":
      return { kind: "header", title: "" } satisfies SectionHeader;
    case "liturgy":
      return { kind: "liturgy", title: "", items: [] } satisfies LiturgyBlock;
    case "song":
      return { kind: "song", title: "" } satisfies Song;
    case "reading":
      return { kind: "reading", title: "", citation: "" } satisfies Reading;
    case "note":
      return { kind: "note", text: "" } satisfies Note;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [parseError, setParseError] = useState<string | null>(null);

  const [plan, setPlan] = useState<ServicePlan | null>(null);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [addKind, setAddKind] = useState<Section["kind"]>("liturgy");

  // -------------------------------------------------------------------------
  // Upload / parse
  // -------------------------------------------------------------------------

  async function handleParse() {
    if (!selectedFile) return;

    setParseState("loading");
    setParseError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const json = (await res.json()) as
        | { plan: ServicePlan; warnings: ParseWarning[] }
        | { error: string };

      if (!res.ok || "error" in json) {
        setParseError("error" in json ? json.error : `Server error ${res.status}`);
        setParseState("error");
        return;
      }

      setPlan(json.plan);
      setWarnings(json.warnings);
      setParseState("done");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Network error");
      setParseState("error");
    }
  }

  function handleReset() {
    setPlan(null);
    setWarnings([]);
    setParseState("idle");
    setParseError(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // -------------------------------------------------------------------------
  // Plan mutation helpers
  // -------------------------------------------------------------------------

  function updateSection(index: number, updated: Section) {
    if (!plan) return;
    const sections = [...plan.sections];
    sections[index] = updated;
    setPlan({ ...plan, sections });
  }

  function moveSection(index: number, direction: "up" | "down") {
    if (!plan) return;
    const sections = [...plan.sections];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setPlan({ ...plan, sections });
  }

  function deleteSection(index: number) {
    if (!plan) return;
    const sections = plan.sections.filter((_, i) => i !== index);
    setPlan({ ...plan, sections });
  }

  function addSection() {
    if (!plan) return;
    setPlan({ ...plan, sections: [...plan.sections, emptySection(addKind)] });
  }

  function splitSection(index: number, itemIndex: number) {
    if (!plan) return;
    const section = plan.sections[index];
    if (section.kind !== "liturgy") return;
    const sections = [...plan.sections];
    const [firstHalf, secondHalf] = splitLiturgyBlock(section, itemIndex);
    sections.splice(index, 1, firstHalf, secondHalf);
    setPlan({ ...plan, sections });
  }

  // -------------------------------------------------------------------------
  // Preview deck
  // -------------------------------------------------------------------------

  async function handlePreview() {
    if (!plan) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(plan));
      router.push("/preview?from=editor");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to open preview");
      setPreviewLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Download
  // -------------------------------------------------------------------------

  function handleDownload() {
    if (!plan) return;
    const dateSlug = plan.metadata.serviceDate || "plan";
    const filename = `${dateSlug}-plan.json`;
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isLoading = parseState === "loading";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Service Builder &mdash; {plan ? "Review" : "Upload"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a bulletin PDF, review and edit the parsed plan, then preview the deck.
          </p>
        </div>
        <Link
          href="/hymns"
          className="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap mt-1"
        >
          Hymn library
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <StepIndicator current={plan ? "review" : "upload"} />

        {/* Upload zone */}
        <section className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Upload Bulletin
          </h2>

          <div className="flex flex-col gap-3">
            <label
              htmlFor="file-input"
              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg px-6 py-8 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <span className="text-gray-400 text-sm mb-1">
                Click to select a PDF
              </span>
              {selectedFile ? (
                <span className="text-sm font-medium text-gray-700 mt-1">
                  {selectedFile.name}
                </span>
              ) : (
                <span className="text-xs text-gray-400">No file selected</span>
              )}
              <input
                id="file-input"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={isLoading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setSelectedFile(f);
                  setParseState("idle");
                  setParseError(null);
                }}
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                onClick={handleParse}
                disabled={!selectedFile || isLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isLoading ? "Parsing..." : "Parse"}
              </button>

              {parseState === "done" && (
                <span className="text-sm text-green-600 font-medium">
                  Parsed successfully
                </span>
              )}
            </div>

            {parseError && (
              <p className="text-sm text-red-600 border border-red-200 rounded px-3 py-2 bg-red-50">
                {parseError}
              </p>
            )}
          </div>
        </section>

        {/* Plan editor */}
        {plan && (
          <section>
            <WarningsPanel warnings={warnings} />

            <MetadataCard
              metadata={plan.metadata}
              onChange={(updated) => setPlan({ ...plan, metadata: updated })}
            />

            <div className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Sections ({plan.sections.length})
              </h2>

              {plan.sections.map((section, idx) => (
                <SectionCard
                  key={idx}
                  section={section}
                  index={idx}
                  total={plan.sections.length}
                  onChange={(updated) => updateSection(idx, updated)}
                  onMoveUp={() => moveSection(idx, "up")}
                  onMoveDown={() => moveSection(idx, "down")}
                  onDelete={() => deleteSection(idx)}
                  onSplit={(itemIndex) => splitSection(idx, itemIndex)}
                />
              ))}

              {/* Add section */}
              <div className="flex items-center gap-2 pt-2">
                <select
                  value={addKind}
                  onChange={(e) => setAddKind(e.target.value as Section["kind"])}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="liturgy">Liturgy</option>
                  <option value="song">Song</option>
                  <option value="reading">Reading</option>
                  <option value="header">Header</option>
                  <option value="note">Note</option>
                </select>
                <button
                  onClick={addSection}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  + Add section
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Sticky bottom bar */}
      {plan && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePreview}
            disabled={previewLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {previewLoading && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Preview deck &rarr;
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 border border-gray-300 text-sm text-gray-500 rounded hover:bg-gray-50"
          >
            Download plan JSON
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded hover:bg-gray-50"
          >
            Reset
          </button>
          <span className="text-xs text-gray-400 ml-2">
            {plan.sections.length} sections &bull; {plan.metadata.serviceDate}
          </span>
          {previewError && (
            <span className="text-xs text-red-600">{previewError}</span>
          )}
        </div>
      )}
    </div>
  );
}
