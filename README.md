# service-builder

A web tool that turns a weekly LSB-style worship-bulletin PDF into broadcast assets
for the [Lutheran Church of the Savior](https://www.lcsavior.org) YouTube
livestream:

- Lower-third **liturgy strips** to overlay on the camera feed
- Full-screen **hymn lyric slides**
- An **OBS scene collection** (`.json`) volunteers import and operate

Built for a single producer prepping once a week. Volunteers run OBS during the
service.

## Quickstart

```sh
npm install
npm run dev
```

Then open <http://localhost:3000> and follow the four-step bar at the top of the
page.

## Workflow

The tool walks you through four steps:

```
Upload › Review › Preview › Build
```

1. **Upload** — drop the week's bulletin PDF on the home page and click *Parse*.
2. **Review** — the parsed plan appears as editable section cards. Adjust titles,
   edit P/C lines, mark sections to exclude from the broadcast. For combined
   liturgy blocks like *"Salutation and Collect of the Day,"* hover between items
   in a card to reveal a **"+ Split section here"** affordance that carves the
   block into two sibling sections, each with its own title.
3. **Preview** — click *Preview Deck →*. Every slide renders to PNG so you can
   scroll through exactly what will air.
4. **Build** — enter the absolute path on the volunteer's OBS machine where the
   zip will be extracted, then click *Build OBS Bundle*. A zip lands in your
   browser downloads.

The **Hymn library** (reachable via the *Hymn library* link in the home-page
header, or at `/hymns`) lets you add, edit, and delete the persistent hymn
records that the build step uses to generate lyric slides. Each hymn stores a
title, optional authors, an optional copyright/CCLI block (rendered as a
footer on every slide of the hymn), and an ordered list of slides (tag +
lyric lines).

Send the zip to the volunteer. They extract it to the exact path you entered,
then in OBS: **Scene Collection › Import › pick `scene_collection.json`**.

> **Path warning.** OBS image sources are absolute paths. The bundle is
> location-specific: whatever path you typed during Build is baked into the
> scene collection. If the volunteer extracts somewhere else, OBS won't find
> the images. Hardening this — relative paths or a post-extract path-fix
> script — is a Stage 5 item; for now the producer and volunteer have to
> coordinate.

## What's in the deck

- **Liturgy strips** — 1920×360 lower-third overlays with the church logo on
  the left, italic Source Serif Pro title, and P/A/L lines normal weight with
  Congregation (C) lines bold. One slide per spoken exchange; long prayers
  auto-split at sentence boundaries.
- **Reading slides** — title + citation + A/C response on a single strip.
  Gospel readings get a pre-announce strip ("The Holy Gospel according to St.
  Matthew, the ninth chapter…") in addition to the post-response.
- **Hymn slides** — full 1920×1080, centered title, italic verse/chorus tag,
  no-wrap lyrics.

Excluded by default (overridable per-service via the Review UI):

- The Introit (read pre-broadcast)
- *Communion Theology and Practice* and *Acknowledgments* (bulletin inserts)
- Rubric items inside liturgy blocks (e.g. "Stand", "Kneel", "Silence for
  reflection")

## Architecture (briefly)

- **Next.js 15** App Router, React 19, TypeScript strict, npm.
- **satori** + **@resvg/resvg-js** for slide rendering (HTML/CSS → SVG → PNG).
- **pdfjs-dist** for bulletin parsing, with custom layout reconstruction.
- **archiver** for the in-memory zip bundle.
- **Vitest** for tests.

Source layout:

| Directory | What's in it |
|---|---|
| `app/` | Next.js routes — Upload/Review on `/`, Preview + Build on `/preview` |
| `lib/` | Schema, parser, expander, renderer, OBS emitter |
| `lib/themes/default/` | Current visual theme |
| `lib/fonts/`, `lib/assets/` | Inter / Source Serif Pro / LSBSymbol, the LCS logo |
| `data/hymns.json` | Local hymn library |
| `examples/{YYYYMMDD}/` | Sample bulletins + reference PPTX/PNG decks |
| `tests/` | Vitest suites |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000 |
| `npm test` | Run the Vitest suite |
| `npm run lint` | ESLint |
| `npm run build` | Production build (also runs typecheck) |

## Project status

Stages 1–3 complete. Stage 3.5 (navigation polish) is wrapping up — Upload →
Review → Preview → Build is now end-to-end. Stage 4 (hymn library editor +
add-from-prompt) is next. Stage 5 (hybrid OBS assembly with a base scene
template) caps the roadmap. See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
for the stage tracker.

## More docs

- [`CLAUDE.md`](./CLAUDE.md) — agent-facing guide (stack details, conventions,
  gotchas, version control rules).
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — staged work tracker.
