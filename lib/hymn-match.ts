// Client-safe normalization helpers for hymn title matching.
//
// This module is fs-free so it can be imported by both server code and
// "use client" components. The private `normalize` function from
// hymn-library.ts was moved here so the editor and server agree on what
// constitutes a match.

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns true if `title` matches any entry in `knownTitles` after
// normalization. Blank/whitespace-only titles always return true so that
// unfilled song rows never show the "not in library" warning.
export function isTitleKnown(knownTitles: string[], title: string): boolean {
  if (!title.trim()) return true;
  const needle = normalizeTitle(title);
  return knownTitles.some((t) => normalizeTitle(t) === needle);
}
