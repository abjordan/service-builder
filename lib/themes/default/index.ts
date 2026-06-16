/**
 * Default theme — white lower-third strips for liturgy/reading, full-slide for hymns.
 * Matches the reference deck in examples/20260614/Liturgy/*.PNG and Hymns/*.PNG.
 */

import React from "react";
import fs from "fs";
import path from "path";
import type { Theme } from "../types";
import type { SlideRenderResult } from "../types";
import type { Slide, LiturgyLine } from "../../render-slide";

// ---------------------------------------------------------------------------
// Logo — loaded once at module init as a base64 data URL
// ---------------------------------------------------------------------------

const LOGO_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "../../assets/lcs-logo.png"
);

function loadLogoDataUrl(): string {
  const buf = fs.readFileSync(LOGO_PATH);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const LOGO_DATA_URL: string = loadLogoDataUrl();

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const STRIP_WIDTH = 1920;
const STRIP_HEIGHT = 360;
const HYMN_WIDTH = 1920;
const HYMN_HEIGHT = 1080;

// Logo column rendered at this size — square, vertically centered in strip
const LOGO_SIZE = 280;

// Strip outer padding
const STRIP_H_PAD = 32;
const STRIP_V_PAD = 20;

// Body text metrics (fontSize × lineHeight)
const BODY_FONT_SIZE = 40;
const BODY_LINE_HEIGHT = 1.3;
// Actual pixel height of one body line-box
const BODY_LINE_BOX = Math.round(BODY_FONT_SIZE * BODY_LINE_HEIGHT); // 52px

// Glyph column fixed width (enough for the LSBSymbol box character)
const GLYPH_COL_WIDTH = 80;

// ---------------------------------------------------------------------------
// Shared helper: strip root (1920×360, white, logo left + content right)
// ---------------------------------------------------------------------------

function stripRoot(children: React.ReactNode): React.ReactElement {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "row" as const,
        width: STRIP_WIDTH,
        height: STRIP_HEIGHT,
        background: "#ffffff",
        alignItems: "center",
        padding: `${STRIP_V_PAD}px ${STRIP_H_PAD}px`,
        boxSizing: "border-box" as const,
      },
    },
    // Logo column
    React.createElement("img", {
      src: LOGO_DATA_URL,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      style: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        objectFit: "contain" as const,
        flexShrink: 0,
        marginRight: 64,
      },
    }),
    // Content column
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column" as const,
          flex: 1,
          height: "100%",
          justifyContent: "center",
          overflow: "hidden" as const,
        },
      },
      children
    )
  );
}

// ---------------------------------------------------------------------------
// LSB inline glyph rendering
//
// Body text strings may contain {{lsb:CHAR}} markers for characters that
// appear in LSBSymbol font in the bulletin (e.g. the cross glyph "T" in
// "In the name of the Father and of the ✠ Son"). Split on these markers
// and render the wrapped span in LSBSymbol so the correct glyph appears.
// ---------------------------------------------------------------------------

const LSB_MARKER_RE = /\{\{lsb:([^}]+)\}\}/g;

function renderTextWithLsb(
  text: string,
  baseFontSize: number,
  _fontWeight: number
): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LSB_MARKER_RE.lastIndex = 0;
  while ((match = LSB_MARKER_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }
    segments.push(
      React.createElement(
        "span",
        {
          key: `lsb-${match.index}`,
          style: {
            fontFamily: "LSBSymbol",
            fontSize: Math.round(baseFontSize * 0.85),
            fontWeight: 400,
            margin: "0 8px",
          },
        },
        match[1]
      )
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }
  if (segments.length === 0) return [text];
  return segments;
}

// ---------------------------------------------------------------------------
// Speaker row — glyph box + text line(s)
// ---------------------------------------------------------------------------

function speakerRow(item: LiturgyLine, key: number): React.ReactElement {
  const isCongregation = item.speaker === "C";
  const fontWeight = isCongregation ? 700 : 400;

  return React.createElement(
    "div",
    {
      key,
      style: {
        display: "flex",
        flexDirection: "row" as const,
        alignItems: "flex-start",
        width: "100%",
        marginBottom: 4,
      },
    },
    // Glyph column — lineHeight matches body line-box so glyph aligns with first line
    React.createElement(
      "div",
      {
        style: {
          width: GLYPH_COL_WIDTH,
          minWidth: GLYPH_COL_WIDTH,
          lineHeight: `${BODY_LINE_BOX}px`,
          fontFamily: "LSBSymbol",
          fontSize: BODY_FONT_SIZE,
          color: "#000000",
          flexShrink: 0,
        },
      },
      item.speaker
    ),
    // Text column — inline LSB markers rendered in LSBSymbol font.
    // Use display:flex + flexWrap so Satori handles mixed text/span children.
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row" as const,
          flexWrap: "wrap" as const,
          alignItems: "baseline",
          flex: 1,
          fontFamily: "Source Serif Pro",
          fontSize: BODY_FONT_SIZE,
          lineHeight: BODY_LINE_HEIGHT,
          color: "#000000",
          fontWeight,
          fontStyle: "normal" as const,
        },
      },
      ...renderTextWithLsb(item.text, BODY_FONT_SIZE, fontWeight)
    )
  );
}

// ---------------------------------------------------------------------------
// renderLiturgy
// ---------------------------------------------------------------------------

function renderLiturgy(
  s: Extract<Slide, { kind: "liturgy" }>
): SlideRenderResult {
  const hasBothTitleAndCitation = !!s.title && !!s.citation;
  const hasTitleOnly = !!s.title && !s.citation;

  // Title row
  let titleRow: React.ReactElement | null = null;
  if (hasBothTitleAndCitation) {
    // Psalm shape: title left / citation right, both italic bold
    titleRow = React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row" as const,
          justifyContent: "space-between",
          width: "100%",
          marginBottom: 8,
        },
      },
      React.createElement(
        "span",
        {
          style: {
            fontFamily: "Source Serif Pro",
            fontSize: 36,
            fontWeight: 700,
            fontStyle: "italic" as const,
            color: "#000000",
          },
        },
        s.title
      ),
      React.createElement(
        "span",
        {
          style: {
            fontFamily: "Source Serif Pro",
            fontSize: 36,
            fontWeight: 700,
            fontStyle: "italic" as const,
            color: "#000000",
          },
        },
        s.citation
      )
    );
  } else if (hasTitleOnly) {
    // Standard shape: centered italic bold title
    titleRow = React.createElement(
      "div",
      {
        style: {
          width: "100%",
          textAlign: "center" as const,
          fontFamily: "Source Serif Pro",
          fontSize: 36,
          fontWeight: 700,
          fontStyle: "italic" as const,
          color: "#000000",
          marginBottom: 8,
        },
      },
      s.title
    );
  }

  const bodyRows = s.items.map((item, i) => speakerRow(item, i));

  const contentChildren: React.ReactNode[] = [];
  if (titleRow) contentChildren.push(titleRow);
  contentChildren.push(...bodyRows);

  return {
    jsx: stripRoot(
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column" as const,
            width: "100%",
          },
        },
        ...contentChildren
      )
    ),
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// renderReading
// ---------------------------------------------------------------------------

function renderReading(
  s: Extract<Slide, { kind: "reading" }>
): SlideRenderResult {
  // Title row — centered italic bold
  const titleEl = React.createElement(
    "div",
    {
      style: {
        width: "100%",
        textAlign: "center" as const,
        fontFamily: "Source Serif Pro",
        fontSize: 32,
        fontWeight: 700,
        fontStyle: "italic" as const,
        color: "#000000",
        marginBottom: 4,
      },
    },
    s.title
  );

  // Citation — centered, large, regular weight
  const citationEl = React.createElement(
    "div",
    {
      style: {
        width: "100%",
        textAlign: "center" as const,
        fontFamily: "Source Serif Pro",
        fontSize: 52,
        fontWeight: 400,
        fontStyle: "normal" as const,
        color: "#000000",
        marginBottom: 8,
      },
    },
    s.citation
  );

  // A/C response rows
  const responseA: LiturgyLine = { speaker: "A", text: s.responseA };
  const responseC: LiturgyLine = { speaker: "C", text: s.responseC };

  return {
    jsx: stripRoot(
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column" as const,
            width: "100%",
          },
        },
        titleEl,
        citationEl,
        speakerRow(responseA, 0),
        speakerRow(responseC, 1)
      )
    ),
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// renderHymn
// ---------------------------------------------------------------------------

const HYMN_H_PAD = 96;
const HYMN_V_PAD = 80;

function renderHymn(
  s: Extract<Slide, { kind: "hymn" }>
): SlideRenderResult {
  // Title — centered, bold
  const titleEl = React.createElement(
    "div",
    {
      style: {
        fontFamily: "Source Serif Pro",
        fontSize: 72,
        fontWeight: 700,
        fontStyle: "normal" as const,
        color: "#000000",
        textAlign: "center" as const,
        marginBottom: s.tag ? 16 : 40,
        width: "100%",
      },
    },
    s.title
  );

  // Tag — italic, gray, left-aligned above lyric block.
  // Tag stored slug-style ("verse-1", "chorus"); display as "Verse 1", "Chorus".
  const tagLabel = s.tag
    ? s.tag
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const tagEl = tagLabel
    ? React.createElement(
        "div",
        {
          style: {
            fontFamily: "Source Serif Pro",
            fontSize: 32,
            fontWeight: 400,
            fontStyle: "italic" as const,
            color: "#555555",
            marginBottom: 16,
            width: "100%",
          },
        },
        tagLabel
      )
    : null;

  // Lyric lines — left-aligned, no-wrap
  const lyricsEl = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: "100%",
        gap: 4,
      },
    },
    ...s.lines.map((line, i) =>
      React.createElement(
        "div",
        {
          key: i,
          style: {
            fontFamily: "Source Serif Pro",
            fontSize: 48,
            fontWeight: 400,
            fontStyle: "normal" as const,
            lineHeight: 1.4,
            color: "#000000",
            whiteSpace: "nowrap" as const,
          },
        },
        line
      )
    )
  );

  // Copyright footer — italic, gray, small, bottom
  const footerEl = s.hymnNumber
    ? React.createElement(
        "div",
        {
          style: {
            fontFamily: "Source Serif Pro",
            fontSize: 24,
            fontWeight: 400,
            fontStyle: "italic" as const,
            color: "#777777",
            marginTop: "auto",
            width: "100%",
            textAlign: "center" as const,
          },
        },
        s.hymnNumber
      )
    : null;

  const children: React.ReactNode[] = [titleEl];
  if (tagEl) children.push(tagEl);
  children.push(lyricsEl);
  if (footerEl) children.push(footerEl);

  return {
    jsx: React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column" as const,
          width: HYMN_WIDTH,
          height: HYMN_HEIGHT,
          background: "#ffffff",
          padding: `${HYMN_V_PAD}px ${HYMN_H_PAD}px`,
          boxSizing: "border-box" as const,
        },
      },
      ...children
    ),
    width: HYMN_WIDTH,
    height: HYMN_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const defaultTheme: Theme = {
  name: "default",
  background: "#ffffff",
  textColor: "#000000",
  accentColor: "#000000",
  baseFontSize: 40,
  renderers: {
    liturgy: renderLiturgy,
    reading: renderReading,
    hymn: renderHymn,
  },
};
