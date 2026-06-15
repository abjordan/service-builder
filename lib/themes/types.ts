/**
 * Theme system type definitions.
 * A Theme provides colors, scale constants, and per-slide-kind JSX renderers.
 */

import type { Slide } from "../render-slide";

export type SlideRenderResult = { jsx: unknown; width: number; height: number };

export type Theme = {
  name: string;
  /** CSS color — used as a reference; actual background is set per renderer. */
  background: string;
  textColor: string;
  accentColor: string;
  /**
   * Base body font size in pixels at the 1920×1080 canvas.
   * Individual renderers may scale up or down from this.
   */
  baseFontSize: number;
  renderers: {
    liturgy: (s: Extract<Slide, { kind: "liturgy" }>) => SlideRenderResult;
    reading: (s: Extract<Slide, { kind: "reading" }>) => SlideRenderResult;
    hymn: (s: Extract<Slide, { kind: "hymn" }>) => SlideRenderResult;
  };
};
