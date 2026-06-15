"use client";

import type {
  Section,
  LiturgyBlock,
  LiturgyItem,
  Song,
  Reading,
  SectionHeader,
  Note,
  Speaker,
} from "@/lib/service-plan";

interface SectionCardProps {
  section: Section;
  index: number;
  total: number;
  onChange: (updated: Section) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

// ----- Reusable field components -----

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

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
      />
    </div>
  );
}

// ----- Liturgy item editor -----

const SPEAKERS: Speaker[] = ["P", "C", "A", "L"];

function LiturgyItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: LiturgyItem;
  onChange: (updated: LiturgyItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 bg-gray-50 rounded p-2">
      {item.kind === "spoken" ? (
        <>
          <select
            value={item.speaker}
            onChange={(e) =>
              onChange({ ...item, speaker: e.target.value as Speaker })
            }
            className="font-mono text-sm border border-gray-300 rounded px-1 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 shrink-0"
          >
            {SPEAKERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <textarea
            value={item.text}
            onChange={(e) => onChange({ ...item, text: e.target.value })}
            rows={2}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
          />
        </>
      ) : (
        <>
          <span className="text-xs text-gray-400 italic shrink-0 mt-2 w-14 text-right pr-1">
            rubric
          </span>
          <input
            type="text"
            value={item.text}
            onChange={(e) => onChange({ ...item, text: e.target.value })}
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm italic focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </>
      )}
      <button
        onClick={onRemove}
        title="Remove item"
        className="shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none mt-1"
      >
        ✕
      </button>
    </div>
  );
}

// ----- Per-kind section editors -----

function HeaderEditor({
  section,
  onChange,
}: {
  section: SectionHeader;
  onChange: (updated: SectionHeader) => void;
}) {
  return (
    <TextInput
      label="Title"
      value={section.title}
      onChange={(v) => onChange({ ...section, title: v })}
    />
  );
}

function LiturgyEditor({
  section,
  onChange,
}: {
  section: LiturgyBlock;
  onChange: (updated: LiturgyBlock) => void;
}) {
  function updateItem(idx: number, item: LiturgyItem) {
    const items = [...section.items];
    items[idx] = item;
    onChange({ ...section, items });
  }

  function removeItem(idx: number) {
    const items = section.items.filter((_, i) => i !== idx);
    onChange({ ...section, items });
  }

  function addSpoken() {
    onChange({
      ...section,
      items: [...section.items, { kind: "spoken", speaker: "P", text: "" }],
    });
  }

  function addRubric() {
    onChange({
      ...section,
      items: [...section.items, { kind: "rubric", text: "" }],
    });
  }

  return (
    <div className="space-y-2">
      <TextInput
        label="Title (optional)"
        value={section.title ?? ""}
        onChange={(v) => onChange({ ...section, title: v || undefined })}
        placeholder="e.g. Confession and Absolution"
      />
      <div className="space-y-1 mt-2">
        {section.items.map((item, idx) => (
          <LiturgyItemRow
            key={idx}
            item={item}
            onChange={(updated) => updateItem(idx, updated)}
            onRemove={() => removeItem(idx)}
          />
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={addSpoken}
          className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-100"
        >
          + Add spoken
        </button>
        <button
          onClick={addRubric}
          className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-100"
        >
          + Add rubric
        </button>
      </div>
    </div>
  );
}

function SongEditor({
  section,
  onChange,
}: {
  section: Song;
  onChange: (updated: Song) => void;
}) {
  const hasHymnal = section.hymnal !== undefined;

  function toggleHymnal() {
    if (hasHymnal) {
      const { hymnal: _h, ...rest } = section;
      onChange(rest as Song);
    } else {
      onChange({ ...section, hymnal: { source: "LSB", number: "" } });
    }
  }

  return (
    <div className="space-y-2">
      <TextInput
        label="Title"
        value={section.title}
        onChange={(v) => onChange({ ...section, title: v })}
      />
      <TextInput
        label="Authors"
        value={section.authors ?? ""}
        onChange={(v) => onChange({ ...section, authors: v || undefined })}
        placeholder="e.g. Brown, Riley"
      />
      <TextInput
        label="Stanza Plan"
        value={section.stanzaPlan ?? ""}
        onChange={(v) => onChange({ ...section, stanzaPlan: v || undefined })}
        placeholder="e.g. Verse, Chorus, Bridge, Chorus"
      />
      <div className="flex items-center gap-3 pt-1">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={hasHymnal}
            onChange={toggleHymnal}
            className="rounded"
          />
          LSB Hymnal number
        </label>
        {hasHymnal && (
          <input
            type="text"
            value={section.hymnal!.number}
            onChange={(e) =>
              onChange({
                ...section,
                hymnal: { source: "LSB", number: e.target.value },
              })
            }
            placeholder="e.g. 158"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}
      </div>
    </div>
  );
}

function ReadingEditor({
  section,
  onChange,
}: {
  section: Reading;
  onChange: (updated: Reading) => void;
}) {
  return (
    <div className="space-y-2">
      <TextInput
        label="Title"
        value={section.title}
        onChange={(v) => onChange({ ...section, title: v })}
      />
      <TextInput
        label="Citation"
        value={section.citation}
        onChange={(v) => onChange({ ...section, citation: v })}
        placeholder="e.g. Exodus 19:2–8a"
      />
    </div>
  );
}

function NoteEditor({
  section,
  onChange,
}: {
  section: Note;
  onChange: (updated: Note) => void;
}) {
  return (
    <div className="space-y-2">
      <TextInput
        label="Title (optional)"
        value={section.title ?? ""}
        onChange={(v) => onChange({ ...section, title: v || undefined })}
      />
      <TextArea
        label="Text"
        value={section.text}
        onChange={(v) => onChange({ ...section, text: v })}
        rows={4}
      />
    </div>
  );
}

// ----- Main section card -----

const KIND_LABELS: Record<Section["kind"], string> = {
  header: "Header",
  liturgy: "Liturgy",
  song: "Song",
  reading: "Reading",
  note: "Note",
};

const KIND_BADGE_CLASSES: Record<Section["kind"], string> = {
  header: "bg-gray-100 text-gray-600",
  liturgy: "bg-blue-100 text-blue-700",
  song: "bg-purple-100 text-purple-700",
  reading: "bg-green-100 text-green-700",
  note: "bg-yellow-100 text-yellow-700",
};

export function SectionCard({
  section,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: SectionCardProps) {
  function renderEditor() {
    switch (section.kind) {
      case "header":
        return (
          <HeaderEditor
            section={section}
            onChange={onChange as (u: SectionHeader) => void}
          />
        );
      case "liturgy":
        return (
          <LiturgyEditor
            section={section}
            onChange={onChange as (u: LiturgyBlock) => void}
          />
        );
      case "song":
        return (
          <SongEditor
            section={section}
            onChange={onChange as (u: Song) => void}
          />
        );
      case "reading":
        return (
          <ReadingEditor
            section={section}
            onChange={onChange as (u: Reading) => void}
          />
        );
      case "note":
        return (
          <NoteEditor
            section={section}
            onChange={onChange as (u: Note) => void}
          />
        );
    }
  }

  const includeInSlides = section.includeInSlides ?? true;
  const toggleIncludeInSlides = () => {
    onChange({ ...section, includeInSlides: includeInSlides ? false : undefined } as Section);
  };

  return (
    <div
      className={`border rounded-lg p-4 ${
        includeInSlides ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono w-6">{index + 1}</span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${KIND_BADGE_CLASSES[section.kind]}`}
          >
            {KIND_LABELS[section.kind]}
          </span>
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none ml-2">
            <input
              type="checkbox"
              checked={includeInSlides}
              onChange={toggleIncludeInSlides}
              className="cursor-pointer"
            />
            Include in slides
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↓
          </button>
          <button
            onClick={onDelete}
            title="Delete section"
            className="text-xs px-2 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50 ml-1"
          >
            Delete
          </button>
        </div>
      </div>
      {renderEditor()}
    </div>
  );
}
