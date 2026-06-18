"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Hymn, HymnSlideContent } from "@/lib/hymn-library";
import { linesToText, textToLines } from "./lyric-text";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadState = "idle" | "loading" | "done" | "error";

const KNOWN_TAGS = [
  "verse-1",
  "verse-2",
  "verse-3",
  "verse-4",
  "verse-5",
  "chorus",
  "refrain",
  "pre-chorus",
  "bridge",
  "ending",
  "unknown",
] as const;

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide editor
// ---------------------------------------------------------------------------

function slideTagOptions(existingTag: string): string[] {
  const known = KNOWN_TAGS as readonly string[];
  if (known.includes(existingTag)) return [...known];
  return [existingTag, ...known];
}

function SlideBlock({
  slide,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  slide: HymnSlideContent;
  index: number;
  total: number;
  onChange: (updated: HymnSlideContent) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const tagOptions = slideTagOptions(slide.tag);
  const text = linesToText(slide.lines);
  // The first block always starts the first slide, so the break control only
  // applies from the second block onward.
  const canBreak = index > 0;
  const breaksHere = canBreak && !!slide.startNewSlide;

  return (
    <>
      {breaksHere && (
        <div className="flex items-center gap-2 pt-1" aria-hidden>
          <span className="h-px flex-1 bg-blue-200" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-blue-400">
            New slide
          </span>
          <span className="h-px flex-1 bg-blue-200" />
        </div>
      )}
      <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={slide.tag}
              onChange={(e) => onChange({ ...slide, tag: e.target.value })}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">Block {index + 1}</span>
          </div>
          <div className="flex items-center gap-1">
            {canBreak && (
              <label className="flex items-center gap-1 text-xs text-gray-500 mr-2 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={breaksHere}
                  onChange={(e) =>
                    onChange({ ...slide, startNewSlide: e.target.checked })
                  }
                />
                Start new slide
              </label>
            )}
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              title="Move up"
              className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↑
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              title="Move down"
              className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↓
            </button>
            <button
              onClick={onRemove}
              title="Remove block"
              className="text-gray-400 hover:text-red-500 text-lg leading-none ml-1"
            >
              ✕
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) =>
            onChange({ ...slide, lines: textToLines(e.target.value) })
          }
          rows={4}
          placeholder="One lyric line per row"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Editor panel
// ---------------------------------------------------------------------------

function HymnEditor({
  initial,
  onSave,
  onCancel,
  saving,
  saveError,
  saved,
  isNew,
}: {
  initial: Partial<Hymn>;
  onSave: (hymn: { title: string; authors?: string; copyright?: string; slides: HymnSlideContent[] }) => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
  isNew: boolean;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [authors, setAuthors] = useState(initial.authors ?? "");
  const [copyright, setCopyright] = useState(initial.copyright ?? "");
  const [slides, setSlides] = useState<HymnSlideContent[]>(
    initial.slides ?? []
  );

  function updateSlide(idx: number, updated: HymnSlideContent) {
    const next = [...slides];
    next[idx] = updated;
    setSlides(next);
  }

  function removeSlide(idx: number) {
    setSlides(slides.filter((_, i) => i !== idx));
  }

  function moveSlide(idx: number, direction: "up" | "down") {
    const next = [...slides];
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSlides(next);
  }

  function addSlide() {
    setSlides([...slides, { tag: "verse-1", lines: [] }]);
  }

  function handleSave() {
    const nonEmptySlides = slides.filter((s) => s.lines.length > 0);
    onSave({
      title: title.trim(),
      ...(authors.trim() ? { authors: authors.trim() } : {}),
      ...(copyright.trim() ? { copyright: copyright.trim() } : {}),
      slides: nonEmptySlides,
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {isNew ? "New Hymn" : "Edit Hymn"}
      </h2>

      <div>
        <TextInput
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="e.g. Everlasting God"
        />
        {!isNew && (
          <p className="text-xs text-gray-400 mt-1">
            Changing the title saves a new entry; the original is kept under its
            old name.
          </p>
        )}
      </div>
      <TextInput
        label="Authors (optional)"
        value={authors}
        onChange={setAuthors}
        placeholder="e.g. Brown, Riley"
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Copyright / CCLI (optional)
        </label>
        <textarea
          value={copyright}
          onChange={(e) => setCopyright(e.target.value)}
          rows={3}
          placeholder={"e.g. ©2005 Thankyou Music\nCCLI License No. 236495"}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Lyric blocks ({slides.length})
        </label>
        <p className="text-xs text-gray-400">
          Blocks auto-pack onto slides to fill the screen. Tick &ldquo;Start new
          slide&rdquo; to force a break before a block.
        </p>
        {slides.map((slide, idx) => (
          <SlideBlock
            key={idx}
            slide={slide}
            index={idx}
            total={slides.length}
            onChange={(updated) => updateSlide(idx, updated)}
            onRemove={() => removeSlide(idx)}
            onMoveUp={() => moveSlide(idx, "up")}
            onMoveDown={() => moveSlide(idx, "down")}
          />
        ))}
        <button
          onClick={addSlide}
          className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-100"
        >
          + Add block
        </button>
      </div>

      {saveError && (
        <p className="text-sm text-red-600 border border-red-200 rounded px-3 py-2 bg-red-50">
          {saveError}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 border border-gray-300 text-sm text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Saved</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page (inner — uses useSearchParams, must be wrapped in Suspense)
// ---------------------------------------------------------------------------

function HymnsPageInner() {
  const searchParams = useSearchParams();

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hymns, setHymns] = useState<Hymn[]>([]);

  const [editing, setEditing] = useState<Partial<Hymn> | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function fetchHymns() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/hymns");
      const json = (await res.json()) as { songs: Hymn[] } | { error: string };
      if (!res.ok || "error" in json) {
        setLoadError("error" in json ? json.error : `Server error ${res.status}`);
        setLoadState("error");
        return;
      }
      setHymns((json as { songs: Hymn[] }).songs);
      setLoadState("done");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
      setLoadState("error");
    }
  }

  useEffect(() => {
    fetchHymns();
  }, []);

  // On initial mount, open the editor pre-filled with the title query param
  // so that the "Add to library" deep-link from the bulletin editor works.
  useEffect(() => {
    const title = searchParams.get("title");
    if (title) {
      setSaved(false);
      setSaveError(null);
      setEditingIsNew(true);
      setEditing({ title });
    }
    // Intentionally runs once on mount only — searchParams is stable on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(data: {
    title: string;
    authors?: string;
    copyright?: string;
    slides: HymnSlideContent[];
  }) {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/hymns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError((json as { error: string }).error ?? `Server error ${res.status}`);
        return;
      }
      setSaved(true);
      setEditing(null);
      await fetchHymns();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(hymn: Hymn) {
    if (!window.confirm(`Delete "${hymn.title}"? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      const res = await fetch(`/api/hymns/${encodeURIComponent(hymn.title)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setDeleteError((json as { error: string }).error ?? `Server error ${res.status}`);
        return;
      }
      await fetchHymns();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Network error");
    }
  }

  function handleEdit(hymn: Hymn) {
    setSaved(false);
    setSaveError(null);
    setEditingIsNew(false);
    setEditing(hymn);
  }

  function handleAddNew() {
    setSaved(false);
    setSaveError(null);
    setEditingIsNew(true);
    setEditing({});
  }

  function handleCancel() {
    setEditing(null);
    setSaveError(null);
    setSaved(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Service Builder &mdash; Hymn Library
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage the persistent hymn library used across services.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          &larr; Home
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {loadState === "loading" && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading hymns...
          </div>
        )}

        {loadState === "error" && (
          <p className="text-sm text-red-600 border border-red-200 rounded px-3 py-2 bg-red-50">
            {loadError}
          </p>
        )}

        {loadState === "done" && !editing && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              {hymns.length === 0 && (
                <p className="px-6 py-4 text-sm text-gray-400">
                  No hymns in the library yet.
                </p>
              )}
              {hymns.map((hymn) => (
                <div
                  key={hymn.id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {hymn.title}
                    </p>
                    {hymn.authors && (
                      <p className="text-xs text-gray-500">{hymn.authors}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {hymn.slides.length} block
                      {hymn.slides.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(hymn)}
                      className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(hymn)}
                      className="text-xs border border-red-200 rounded px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {deleteError && (
              <p className="text-sm text-red-600 border border-red-200 rounded px-3 py-2 bg-red-50">
                {deleteError}
              </p>
            )}

            <button
              onClick={handleAddNew}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
            >
              + Add new hymn
            </button>
          </>
        )}

        {editing !== null && (
          <HymnEditor
            initial={editing}
            onSave={handleSave}
            onCancel={handleCancel}
            saving={saving}
            saveError={saveError}
            saved={saved}
            isNew={editingIsNew}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell — wraps inner in Suspense (required by Next.js for useSearchParams)
// ---------------------------------------------------------------------------

export default function HymnsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-sm text-gray-500">Loading&hellip;</p>
        </div>
      }
    >
      <HymnsPageInner />
    </Suspense>
  );
}
