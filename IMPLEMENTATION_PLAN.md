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

**Status**: Complete (with follow-up items — see Stocktake below)

## Stage 3.5: Navigation polish + README
**Goal**: Make the end-to-end user flow obvious in the UI, and make the
project legible to a stranger via a README. Currently the editor page
dead-ends at the deck preview because the "Build OBS Bundle" action — the
actual product output — was implemented at the CLI level (Stage 1 thin
slice) and never wired into the UI. Surface it. Also drop the internal
"Stage N" labels from user-facing chrome.

### Substages

**3.5a. Drop development-stage labels from the UI**
- `app/page.tsx` header "Service Builder — Stage 2: Review" → "Service
  Builder — Review".
- Same fix on `app/preview/page.tsx`.
- Stage tracking lives in `IMPLEMENTATION_PLAN.md`, not in user chrome.

**3.5b. Demote "Download plan JSON"; promote "Preview Deck →"**
- Keep "Download plan JSON" (useful for debugging + persisting state across
  sessions), but make it visually secondary — smaller / ghost-button.
- Make "Preview Deck →" the primary CTA on the editor page.

**3.5c. Add "Build OBS Bundle" action on `/preview`**
- New primary button below the rendered deck. POSTs the plan to
  `/api/build`, receives the zip, triggers browser download. Filename:
  `{serviceDate}-bundle.zip`.
- Disabled while preview is loading or if any slide failed to render.
- `/api/build` currently accepts a `Stage1BuildRequest` (single hard-coded
  hymn). Extend it to take a full `ServicePlan` and assemble the whole
  deck (expander → render-all → emit scene collection → zip).

**3.5d. Step indicator across pages**
- Small breadcrumb at the top: `Upload › Review › Preview › Build`.
- Highlights the current step. Indicates progression without being heavy
  chrome.

**3.5e. `README.md`**
- One-line project intro + who it's for.
- Quickstart: clone, `npm install`, `npm run dev`, upload a bulletin.
- User workflow walkthrough (the four steps above).
- Architecture paragraph (stack, where files live).
- Pointers to `CLAUDE.md` (agent guide) and `IMPLEMENTATION_PLAN.md`
  (stage tracker).
- Keep it under one page of scroll. Detailed engineering belongs in
  `CLAUDE.md`.

**Success Criteria**:
- A fresh user lands on `/`, follows Upload → Review → Preview → Build,
  and ends with a zip on disk — no question about what to click.
- `Build OBS Bundle` produces a downloadable zip importable into OBS.
- `README.md` exists and explains the project + workflow under one screen.
- Zero "Stage N" labels in the live UI.

**Tests**:
- Extend `tests/build-bundle.test.ts` to cover full-`ServicePlan` input.
- Lightweight click-path verification of the new Build button (or manual).
- README: review by hand.

**Status**: Complete

## Stage 4: Library editor + UX overrides
**Goal**: Make the review UI usable week-to-week without hand-editing JSON.
Three threads: (1) persistent hymn library with an editor + add-from-prompt
flow; (2) per-hymn layout overrides (refrain placement + manual slide-split
markers); (3) UI affordance to split a single liturgy block into two
sibling sections (resolves the deferred "Salutation and Collect of the Day"
→ "Salutation" + "Collect of the Day" case from Stage 3 polish).

### Substages

**4a. Hymn API + persistence** — DONE
- `GET /api/hymns` (list), `POST /api/hymns` (create/update by title),
  `DELETE /api/hymns/:title`.
- CRUD logic lives in pure helpers in `lib/hymn-library.ts`
  (`slugify`, `upsertHymn`, `deleteHymnByTitle`); routes are thin wrappers.
- Writes back to `data/hymns.json` via `writeLibrary`. Single-user, no
  contention; read-modify-write is fine.
- Helpers unit-tested in `tests/hymns-api.test.ts` (kept off the shared
  `data/hymns.json` since Vitest runs suites in parallel).

**4b-1. Hymn editor UI (CRUD)** — DONE
- New page `/hymns` — list view, edit form, "Add new", delete.
- Editor fields: title, authors.
- Lyrics editor: per-slide blocks (each with `tag` + `lines`).
  - Per-slide tag dropdown (`verse-1`, `chorus`, `bridge`, …).
  - Add / remove / reorder slide blocks; lines edited as newline-separated
    text. (Manual carve is achieved via add/remove/reorder slides.)
- "Save" button → `POST /api/hymns`; delete → `DELETE /api/hymns/:title`.
- Link to `/hymns` from the home page; back-link to home.
- No schema change — uses the existing `Hymn` type + the 4a API.
- Note: hymnal number is per-Song (already editable in `SectionCard`), not a
  library-entry field, so it is intentionally NOT in this editor.

**4b-2a. Hymn copyright/CCLI footer** — DONE
- Added `copyright?: string` (free-form multi-line) to the `Hymn` type and the
  hymn `Slide`; textarea field in the `/hymns` editor; plumbed through the
  expander onto every slide of the hymn.
- Renderer draws it as centered italic gray lines at the bottom, stacked with
  the existing `hymnNumber` line. Ground truth: `examples/20260614/Hymns/Slide2.PNG`.
- Also fixed a pre-existing satori centering bug: the hymn **title** (and the
  new footer) rendered left-aligned because satori treats divs as flex, so
  `textAlign: center` is ignored — fixed with `justifyContent: center`.

**4b-2b. Refrain placement (DEFERRED — needs design pass)**
- `append-to-verse` / `own-slide` / `auto-split`. The reference deck renders a
  verse AND its refrain as two labeled blocks on ONE slide, but the current
  hymn `Slide` model is one tag + one flat `lines[]`, and imported hymn data
  stores each block as a separate slide entry. This needs a multi-block hymn
  slide type + expander composition + auto-split, grounded in several
  reference slides. Own stage; overlaps the Stage 4 "per-hymn layout
  overrides" goal.

**4c. Unknown-hymn detection + add-to-library flow** — DONE
- The editor (review step) fetches the library and flags any `song` whose
  title isn't in it with an amber "Add to library" CTA in `SongEditor`.
  (Detection lives in the editor, not the preview warnings, so it's caught
  before rendering a deck of placeholder lyrics.)
- CTA opens `/hymns?title=<X>` in a new tab, pre-filled as a NEW hymn. The
  editor re-fetches the library on window focus, so the warning clears when
  the user returns after adding the hymn.
- Normalization shared via `lib/hymn-match.ts` (`normalizeTitle`,
  `isTitleKnown`) so editor and server agree on matches.

**4d. Section-split UI**
- In `SectionCard`'s `LiturgyEditor`, add a "Split section here" affordance
  between items. Clicking splits the current `LiturgyBlock` at that
  boundary into two adjacent `LiturgyBlock` sections. — DONE
  - First half retains the original section's properties.
  - Second half gets an empty title input (user fills in, e.g., "Collect of
    the Day"); inherits `includeInSlides` from the source.
- Optional: "Merge with previous section" button on a liturgy card to undo.
- No schema change — the plan already supports adjacent liturgy blocks.
- This is what lets the user turn "Salutation and Collect of the Day" into
  two cleanly-titled sub-sections in one click.

**Success Criteria**:
- New hymn added via UI persists to `data/hymns.json` and is found on the
  next build without restart.
- Hymn editor supports manual slide-split markers; expander respects them
  (auto-split stays as the default when no markers are present).
- "Unknown hymn" warning has a working add-to-library flow.
- Splitting a liturgy section produces two adjacent sections in the plan
  JSON, each renderable independently with its own title.

**Tests**:
- Hymn API CRUD round-trip.
- Expander honors `slidesOverride` / split markers on a fixture hymn.
- Section-split utility: given a `LiturgyBlock` + item index, returns two
  `LiturgyBlock`s with the items distributed correctly.

**Status**: In Progress (4a, 4b-1, 4b-2a, 4c, 4d done; 4b-2b refrain placement deferred)

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
