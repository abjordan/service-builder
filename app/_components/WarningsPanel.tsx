"use client";

import type { ParseWarning } from "@/lib/service-plan";

interface WarningsPanelProps {
  warnings: ParseWarning[];
}

const SEVERITY_CLASSES: Record<ParseWarning["severity"], string> = {
  info: "bg-gray-50 border-gray-200 text-gray-700",
  warn: "bg-amber-50 border-amber-200 text-amber-800",
  error: "bg-red-50 border-red-200 text-red-800",
};

const SEVERITY_LABEL: Record<ParseWarning["severity"], string> = {
  info: "info",
  warn: "warn",
  error: "error",
};

export function WarningsPanel({ warnings }: WarningsPanelProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Warnings ({warnings.length})
      </h2>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 border rounded px-3 py-2 text-sm ${SEVERITY_CLASSES[w.severity]}`}
          >
            <span className="font-mono font-semibold uppercase text-xs mt-0.5 shrink-0">
              {SEVERITY_LABEL[w.severity]}
            </span>
            <span>
              {w.message}
              {w.lineHint && (
                <span className="ml-2 font-mono text-xs opacity-70">
                  ({w.lineHint})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
