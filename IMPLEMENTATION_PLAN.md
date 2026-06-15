# Service Builder — Implementation Plan

Web app that turns a weekly LSB bulletin PDF into an OBS scene collection + slide assets
for the @lcsavior livestream. Volunteers import the bundle into OBS and operate normally.

Pipeline: **Plan** (parse + edit bulletin) → **Render** (themed slide images) → **Assemble**
(scene collection .json + asset bundle).

Stack: Next.js + TypeScript, server-side slide rendering via satori → PNG, local SQLite
(or flat-file) hymn library. No live OBS control.

---

## Stage 1: End-to-End Thin Slice
**Goal**: Prove the whole pipeline with one hand-written service plan: scaffold the
Next.js app, render a single themed hymn slide as PNG, emit a minimal OBS scene
collection .json with one `slideshow` source pointing at that image, and verify the
file opens cleanly in OBS.
**Success Criteria**:
- `pnpm dev` runs the Next.js app locally.
- A `POST /api/build` endpoint accepts a tiny service-plan JSON and returns a `.zip`
  containing one PNG + one `scene_collection.json`.
- Volunteer can import the .json into OBS and see the rendered slide on the scene.
**Tests**:
- Renderer unit test: given a fixture verse + theme, snapshot the PNG output.
- Scene-collection emitter unit test: produces JSON that round-trips through OBS's
  schema (validated against a copy of `examples/20260614/20260614.json`).
**Status**: Not Started

## Stage 2: Bulletin PDF Parser
**Goal**: Parse `examples/20260614/...Livestream.pdf` into a structured service-plan
JSON (sections in order, liturgy lines tagged P/C/A, hymn references with hymnal +
number, rubric instructions separated from spoken text).
**Success Criteria**:
- Parser extracts ≥95% of liturgy lines correctly on the example bulletin.
- Hymn references like "LSB 645" and free-form songs ("Everlasting God (Brown, Riley)")
  are both recognized.
- Browser UI shows the parsed plan with an editor for fixing parser errors.
**Tests**:
- Fixture test against `examples/20260614/` with the expected service-plan JSON.
- One adversarial fixture (a messier bulletin or hand-edited variant) to catch
  brittleness.
**Status**: Not Started

## Stage 3: Themed Slide Rendering — REWRITE
**Goal**: Match the reference PPTX deck (`examples/20260614/Liturgy/*.PNG`,
`examples/20260614/Hymns/*.PNG`): liturgy as a **1920×360 lower-third strip** with
the church logo, italic Source Serif Pro title, P/A/L lines normal + C lines bold;
hymns as a **1920×1080 full slide** with no-wrap lyrics. Drop the dark-gradient
full-screen layout entirely.

### Design ground truth (from references)
- **Liturgy strip**: 1920×360, white background, logo left (~320px wide), italic
  Source Serif Pro title centered (or `title left / citation right` for Psalms),
  body below with LSBSymbol glyph box + serif text. **C is bold**. Glyph midpoint
  aligns with first-line midpoint.
- **Reading (OT/Epistle)**: ONE strip with title + large citation + A response + C
  response. Defaults: A "This is the Word of the Lord." / C "Thanks be to God."
- **Reading (Gospel)**: 2 strips (announce + post-response). Defer the announce
  strip — emit only post-response for now: A "This is the Gospel of the Lord." /
  C "Praise to You, O Christ."
- **Hymn slide**: 1920×1080 white background, centered serif title, italic gray tag
  ("v1", "chorus") left-of-block, `whiteSpace: nowrap` lyrics, copyright footer.
- **Section-title slides**: REMOVED — title is part of every strip.

### Substages

**3a. Schema + types + assets**
- Move `lcs-logo.png` → `lib/assets/lcs-logo.png`.
- Download Source Serif Pro Regular + Italic + Bold WOFF (v1 — satori limitation)
  into `lib/fonts/`.
- `lib/render-slide.ts` Slide union:
  - Remove `section-title` kind.
  - `liturgy`: add `title?: string`, `citation?: string`.
  - `reading`: add `responseA: string`, `responseC: string`.
- `lib/themes/types.ts`: drop `sectionTitle`; each renderer returns
  `{ jsx, width, height }` so liturgy can be 1920×360 and hymn 1920×1080.
- Register all three Source Serif weights with satori; preload logo as data URL.

**3b. Theme rewrite (`lib/themes/default/index.ts`)**
- `stripRoot(children)` — 1920×360, white bg, flex row with logo column (320×320,
  centered) + content column (flex 1).
- `renderLiturgy(s)`:
  - Title row: Psalm shape (`title + citation`) → flex row space-between, both
    italic. Other shape → centered italic title.
  - Body: speaker rows. Speaker glyph in a fixed `lineHeight = bodyLineHeight`
    container so glyph midpoint = first text-line midpoint. C → fontWeight 700.
- `renderReading(s)`:
  - Title row centered italic, large citation centered below, then A/C response
    rows with same speaker-glyph treatment (C bold).
- `renderHymn(s)`: 1920×1080 white, centered serif title, italic gray tag, lyric
  lines with `whiteSpace: nowrap`, copyright footer at bottom.

**3c. Expander rewrite (`lib/expand-plan.ts`)**
- Remove every `section-title` emission (header + liturgy-with-title).
- Liturgy: pass `section.title` through to each emitted liturgy slide as `title`.
- Liturgy auto-pair logic unchanged.
- Reading: emit ONE combined slide. Pick A/C defaults by title:
  - title contains "Gospel" → "This is the Gospel of the Lord." /
    "Praise to You, O Christ."
  - else → "This is the Word of the Lord." / "Thanks be to God."

**3d. Test updates**
- Update `tests/render-slide.test.ts`, `render-deck-snapshot.test.ts`,
  `expand-plan.test.ts` for new slide kinds + dimensions.
- Regenerate visual snapshots.

**3e. Visual verification**
- Start dev server, upload a bulletin, view `/preview`, compare against the
  reference PNGs side-by-side.

**Success Criteria**:
- Liturgy slides match the strip layout (verified visually against Slide1,
  Slide9, Slide10, Slide13 references).
- Reading slide matches Slide16 (OT) and Slide20 (Gospel post-response).
- Hymn slide matches Slide2 (Everlasting God).
- No section-title slides anywhere in the deck.
- All vitest suites pass.

**Tests**:
- Snapshot test per slide kind.
- Unit test: expander emits no `section-title` slides given the example plan.
- Unit test: Reading expander picks Gospel responses when title contains "Gospel".

**Status**: In Progress

## Stage 4: Hymn Library
**Goal**: Local store of hymn lyrics keyed by (hymnal, number). On first encounter of
an unknown hymn, the UI prompts with a paste-in form; the entry is saved for reuse.
Each hymn record stores its verse/refrain layout preference.
**Success Criteria**:
- New hymn added via UI persists and is found on the next build.
- Hymn record schema: hymnal, number, title, verses[], refrain?, layout config.
- Bulk import from a CSV or JSON file for seeding (not required, but designed for).
**Tests**:
- CRUD round-trip test on the library store.
- "Unknown hymn" flow: missing hymn in plan → UI prompt → save → next build succeeds.
**Status**: Not Started

## Stage 5: Hybrid OBS Assembly + Download
**Goal**: Maintain a base scene collection (cameras, audio, title cards, transitions);
generate per-section scenes wholesale (Opening Hymn, Conf/Abs, Gloria, Readings,
Creed, Sermon Hymn, Sermon, Prayers, Closing Hymn) and splice into the base in the
liturgical order from the service plan. Emit a `.zip` with `scene_collection.json` +
all PNG assets, paths relative so the bundle is portable.
**Success Criteria**:
- Output `.zip` is drop-in importable into OBS on a volunteer's machine.
- Static scenes from the base (Intro, Welcome, Outro, etc.) carry through unchanged.
- Generated scenes use the same source types (`slideshow`, `image_source`,
  `text_gdiplus`) and naming patterns as the hand-built `20260614.json`.
**Tests**:
- Schema-validate the emitted .json against an OBS scene-collection JSON schema.
- Diff test: regenerated `20260614.json` from a captured service-plan fixture is
  structurally equivalent to the hand-built original (allowing for known differences).
**Status**: Not Started
