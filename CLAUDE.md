# service-builder

Next.js + TypeScript web app that turns a weekly LSB-style worship-bulletin PDF
into broadcast assets for the @lcsavior YouTube livestream:

1. **Lower-third liturgy strips** to overlay on the camera feed
2. **Full-screen hymn lyric slides**
3. An **OBS scene collection** (`.json`) volunteers import and operate

User is the producer for Lutheran Church of the Savior. The tool generates the
bundle; volunteers run OBS during the service.

## Pipeline
**Plan** (parse + edit bulletin) → **Render** (themed slide images) → **Assemble**
(scene collection JSON + asset bundle).

## Stack
- **Next.js 15** (App Router), **React 19**, **TypeScript strict**
- **npm** (lockfile is `package-lock.json`)
- **satori** + **@resvg/resvg-js** — HTML/CSS → SVG → PNG slide rendering
- **pdfjs-dist** — PDF text extraction with custom layout reconstruction
- **archiver** — in-memory zip for the bundle download
- **Vitest** — test framework

## Key directories
- `lib/` — schema, parser, expander, renderer, OBS emitter (all server-side)
- `lib/themes/default/` — current theme; one directory per future seasonal theme
- `lib/fonts/` — `Inter-Regular.woff`, `LSBSymbol.ttf`, `SourceSerifPro-{Regular,Italic,Bold}.woff`
- `lib/assets/` — `lcs-logo.png` (Lutheran rose, 2579×2602 RGBA)
- `app/` — Next.js routes (review/edit UI, preview grid, `/api/*` endpoints)
- `tests/` — Vitest suites (parser fixtures, render snapshots, expander, OBS emitter)
- `examples/` — reference materials (see Reference materials below)
- `scripts/` — one-off CLI helpers (`build-stage1.ts`, `import-hymns.ts`)
- `data/hymns.json` — hymn library (4 hymns currently)

## Stages & planning
- `IMPLEMENTATION_PLAN.md` tracks staged work. Update `Status:` in place as you
  progress; delete the file when all stages are done (per user's global rules).
- 5 stages: (1) thin slice, (2) PDF parser, (3) themed rendering — **rewrite in
  progress to match reference PPTX**, (4) hymn library editor, (5) hybrid OBS
  assembly with base template.

## Slide rendering ground truth
This was the hardest thing to get right. Reference PNGs in `examples/20260614/`
are the source of visual truth.

- **Liturgy slides are lower-third strips**, NOT full-screen. Canvas 1920×360,
  white background.
  - Logo column on the left (~312×312).
  - Italic Source Serif Pro **title** at top of body. Psalm shape: title left +
    citation right.
  - Body: LSBSymbol speaker glyph + serif text. **C lines are bold (700);
    P/A/L lines normal (400).** Glyph midpoint aligns with first text-line
    midpoint (matched line-heights, not block-center).
- **Reading slides** combine title + citation + A/C response on **one strip**.
  Defaults by heuristic: title contains "Gospel" → "This is the Gospel of the
  Lord." / "Praise to You, O Christ."; else → "This is the Word of the Lord." /
  "Thanks be to God."
- **Hymn slides** are full 1920×1080 white background, centered Source Serif Pro
  Bold title, italic gray tag ("v1", "chorus"), `whiteSpace: nowrap` lyric
  lines, optional copyright footer.
- **No `section-title` slide kind** — title is embedded in every strip.
- **The LSBSymbol font's glyph is the filled box itself** — no extra rounded
  amber background; render glyphs in white/black at body-line size.

Each theme renderer returns `{ jsx, width, height }` so liturgy can be 360 tall
while hymns are 1080.

## House rules for what appears on slides
Excluded by default (parser sets `includeInSlides: false`):
- **Introit** — read before broadcast goes live
- **Communion Theology and Practice** — bulletin insert, not a graphic
- **Acknowledgments** — back-of-bulletin
- **Resources for Meditation this Week** — back-of-bulletin

Filtered at the renderer/emitter level:
- **Rubric items** inside liturgy blocks (e.g. "Stand", "Sit", "Silence for
  reflection") — stage directions, not on-screen content.

The editor UI exposes a per-section `Include in slides` checkbox so the default
can be overridden for any specific service.

## Collaboration preferences
- **Delegation**: prefer Sonnet/Haiku subagents for implementation; Opus
  orchestrates and reviews. Use subagents liberally.
- **Slow down and plan when something is fundamentally off** — when in doubt,
  ground the design in reference material (`examples/`) before writing code,
  not after. Present the plan, get confirmation, then delegate.
- **3-attempt rule** (from the user's global guide): max 3 attempts at a problem
  before stopping to document and reconsider.

## Code conventions
- No emojis in code (or in chat) unless the user asks.
- Don't add comments unless the **why** is non-obvious. Well-named identifiers
  carry the **what**.
- Boring and obvious over clever. Single responsibility per function.
- Don't introduce backwards-compat shims when you can just change the code.
- No commit hook bypasses (`--no-verify`) — fix the hook failure instead.
- Don't commit unless explicitly asked.

## Commands
- `npm run dev` — local Next.js server
- `npm test` — Vitest (one suite `render-deck-snapshot.test.ts` is gated on
  `RENDER_PREVIEW=1`)
- `npm run lint` — Next/ESLint
- `npm run build` — production build (also runs typecheck)

## Gotchas
- **satori needs WOFF v1, not WOFF2.** Verify with `xxd -l 4 <file>` showing
  `wOFF` (not `wOF2`). Source Serif Pro from `@fontsource/source-serif-4` is
  Adobe's renamed Source Serif — glyph shapes match Source Serif Pro.
- **`next.config.ts` has `serverExternalPackages: ["@resvg/resvg-js",
  "archiver", "pdfjs-dist"]`** — these are native/CJS and break under Next's
  bundler if not externalized.
- **ESLint** is configured to ignore unused vars prefixed with `_`. Use
  `_unusedParam` instead of disabling rules.
- **pdfjs-dist worker** required adding it to `serverExternalPackages` (above).
- **PPTX text extraction** (for the hymn importer) uses `unzip -p` + regex on
  `<a:t>...</a:t>` — OOXML is just zipped XML.

## OBS scene collection format
- Canvas UUID sentinel `6c69626f-6273-4c00-9d88-c5136d61696e` — keep as-is.
- Use `crypto.randomUUID()` for all other scene/source UUIDs.
- Reference template: `examples/20260614/20260614.json` (round-tripped through
  the emitter unit test).

## Reference materials
- `examples/{YYYYMMDD}/` — past-service artifacts. Today's is `20260614`.
- `examples/20260614/Liturgy/*.PNG` — lower-third strips (3230×360 native, our
  renderer outputs 1920×360).
- `examples/20260614/Hymns/*.PNG` — full hymn slides (4800×2700 native, our
  renderer outputs 1920×1080).
- `examples/Liturgy.pptx`, `examples/Hymns.pptx` — source PowerPoint decks.
- `examples/20260614/...Livestream.pdf` — example bulletin input.

## Testing
- Parser uses fixture comparison against `examples/20260614/`.
- Renderer has snapshot tests per slide kind (skip-by-default visual snapshot
  suite under `RENDER_PREVIEW=1`).
- OBS emitter round-trips against the reference `20260614.json`.
