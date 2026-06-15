"use client";

import type { PreviewSlide } from "@/app/preview/types";

// Kind badge colors
const KIND_COLORS: Record<string, string> = {
  liturgy: "bg-amber-100 text-amber-700",
  reading: "bg-emerald-100 text-emerald-700",
  hymn: "bg-rose-100 text-rose-700",
};

function KindBadge({ kind }: { kind: string }) {
  const colors = KIND_COLORS[kind] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={`absolute top-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors} opacity-90`}
    >
      {kind}
    </span>
  );
}

function SlideThumbnail({ slide }: { slide: PreviewSlide }) {
  return (
    <div className="flex flex-col gap-1">
      {/* 16:9 image container */}
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.png}
          alt={slide.label}
          className="w-full h-full object-cover rounded border border-gray-200"
        />
        <KindBadge kind={slide.kind} />
      </div>
      <p className="text-xs text-gray-500 truncate leading-tight" title={slide.label}>
        {slide.label}
      </p>
    </div>
  );
}

type SlideGridProps = {
  slides: PreviewSlide[];
  warnings: { sectionIndex: number; message: string }[];
};

export function SlideGrid({ slides, warnings }: SlideGridProps) {
  return (
    <div>
      {/* Summary line */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600 font-medium">
          {slides.length} slide{slides.length !== 1 ? "s" : ""}
          {" — "}
          {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Warnings collapsible */}
      {warnings.length > 0 && (
        <details className="mb-4 border border-amber-200 rounded-lg bg-amber-50">
          <summary className="px-4 py-2 text-sm font-medium text-amber-800 cursor-pointer select-none">
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""} — click to expand
          </summary>
          <ul className="px-4 pb-3 pt-1 space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">
                <span className="font-medium">Section {w.sectionIndex}:</span> {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Responsive grid: 1 col mobile, 2 tablet, 3 desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide) => (
          <SlideThumbnail key={slide.id} slide={slide} />
        ))}
      </div>
    </div>
  );
}
