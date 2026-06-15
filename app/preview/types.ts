// Shared types for the deck preview API and UI.

import type { Slide } from "@/lib/render-slide";

// Shape of each slide entry returned from /api/preview.
export type PreviewSlide = {
  id: string;
  label: string;
  kind: Slide["kind"];
  sectionIndex: number;
  // PNG encoded as a base64 data URL: "data:image/png;base64,<base64>"
  png: string;
};

// Success response shape from /api/preview.
export type PreviewResponse = {
  slides: PreviewSlide[];
  warnings: { sectionIndex: number; message: string }[];
  totalSlides: number;
};

// Error response shape from /api/preview.
export type PreviewErrorResponse = {
  error: string;
};

// Session storage key used to pass preview results from the editor to /preview.
export const PREVIEW_SESSION_KEY = "service-builder:preview-result";
