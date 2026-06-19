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
- Active stages: (1) thin slice, (2) PDF parser, (3) themed rendering, (3.5)
  navigation polish + README, (4) hymn library editor + section split, (5)
  hybrid OBS assembly with base template.

## Documentation
Three docs serve three audiences — keep them in sync.

- **`README.md`** — user-facing. What this is, how to run it, what to click.
  Stays under one screen of scroll.
- **`CLAUDE.md`** (this file) — agent-facing. Stack, conventions, gotchas,
  references. Tribal knowledge.
- **`IMPLEMENTATION_PLAN.md`** — task-facing. Staged work tracker.

When a change affects the **user workflow** (new UI step, new page, new
affordance, new keyboard shortcut) or the **quickstart** (new env var, new
command, new dependency that needs installing), update `README.md` in the
same commit. Don't let it drift. Likewise, when a load-bearing convention
or gotcha changes, update `CLAUDE.md`.

## Slide rendering ground truth
This was the hardest thing to get right. Reference PNGs in `examples/20260614/`
are the source of visual truth.

- **Liturgy slides are lower-third strips**, NOT full-screen. Canvas 3230×360
  (the reference native size, aspect ~9:1), white background. The OBS scene
  places them at scale ~0.59 → 1920×214, a slim lower third over the live
  camera. Rendering at the wide native size (not 1920×360) keeps the strip from
  becoming a chunky 1/3-height band.
  - Logo column on the left (~300×300).
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
  Bold title, then one or more labeled lyric **blocks** — each a lowercase
  italic gray hanging tag ("v1", "chorus") above left-indented
  `whiteSpace: nowrap` lyric lines — and an optional copyright footer. The
  hymn `Slide` carries `blocks: { tag?, lines }[]`; the expander packs
  consecutive library blocks onto a slide by a px budget (`packHymnBlocks`)
  and honors a per-block `startNewSlide` marker that forces a slide break.
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

## Version control
This repo uses **git**. Default branch is `main`.

- **Don't commit unless the user explicitly asks.** When they do:
  - Stage explicit paths (`git add CLAUDE.md lib/parse-bulletin.ts …`), not
    `git add -A` or `git add .` — keeps stray artifacts (zips, scratch PNGs in
    `out/`) out of the index.
  - Commit messages via HEREDOC with a `Co-Authored-By: Claude Opus 4.7
    <noreply@anthropic.com>` footer. Lead with the *why*, not a file list.
  - Never `--no-verify`, never amend a commit the user didn't ask you to amend,
    never force-push.
- Don't push to a remote unless asked. There may not even be one configured.
- `.gitignore` covers `node_modules/`, `.next/`, `out/`, env files,
  `*.tsbuildinfo`, `.claude/settings.local.json`, `examples/**/*.zip`. If
  something new shouldn't be tracked, add it there before committing.
- Before a destructive operation (`git reset --hard`, branch delete, etc.),
  stop and ask.

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
- **Stage 5 assembly pipeline** (hybrid build):
  - `lib/base-template.json` — checked-in base (broadcast infra + bookend
    scenes), derived from the reference by `lib/derive-base-template.ts`. Regen
    with `npm run derive:base-template`; don't hand-edit.
  - `lib/generate-content-scene.ts` — one content scene = shared camera
    (`id: dshow_input`, referenced by uuid) under a manual `slideshow`. Layout:
    hymn full-screen `pos (0,0) scale 1`; strip `pos (0,720) scale 1` (our PNGs
    are canvas-res, so scale 1.0 — unlike the reference's fractional scales).
  - `lib/assemble-collection.ts` — `groupSlidesIntoSceneSpecs` (one scene per
    contiguous section) + `spliceContentScenes` (weave generated scenes into
    base scene_order, between "Welcome" and "Thanks").
  - `buildServicePlanBundle` wires render → group → splice. Slideshow file
    paths stay **absolute** (OBS requirement); `obsExtractPath` is baked in.

## Reference materials
- `examples/{YYYYMMDD}/` — past-service artifacts. Today's is `20260614`.
- `examples/20260614/Liturgy/*.PNG` — lower-third strips (3230×360 native; our
  renderer matches this size).
- `examples/20260614/Hymns/*.PNG` — full hymn slides (4800×2700 native, our
  renderer outputs 1920×1080).
- `examples/Liturgy.pptx`, `examples/Hymns.pptx` — source PowerPoint decks.
- `examples/20260614/...Livestream.pdf` — example bulletin input.

## Testing
- Parser uses fixture comparison against `examples/20260614/`.
- Renderer has snapshot tests per slide kind (skip-by-default visual snapshot
  suite under `RENDER_PREVIEW=1`).
- OBS emitter round-trips against the reference `20260614.json`.
