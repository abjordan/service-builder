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
footer on every slide of the hymn), and an ordered list of lyric blocks (a
tag plus lines). Blocks auto-pack onto slides to fill the screen — a verse
and its refrain can share one slide; tick *Start new slide* on a block to
force a break before it.

Send the zip to the volunteer. They extract it to the exact path you entered,
then in OBS: **Scene Collection › Import › pick `scene_collection.json`**.

The collection keeps your **base scenes** (Intro, Welcome, Thanks, Outro,
shared camera, audio) and splices **one content scene per service section**
between *Welcome* and *Thanks*, in order. Each content scene overlays its
slides — full-screen for hymns, lower-third strip over the camera for
liturgy — as a manual slideshow the volunteer clicks through.

> **Path warning.** OBS slideshow sources are absolute paths. The bundle is
> location-specific: whatever path you typed during Build is baked into the
> scene collection. If the volunteer extracts somewhere else, OBS won't find
> the images. This is inherent to OBS (slideshow/image sources require
> absolute paths), so producer and volunteer must agree on the extract path.

## What's in the deck

- **Liturgy strips** — slim ~9:1 lower-third overlays with the church logo on
  the left, italic Source Serif Pro title, and P/A/L lines normal weight with
  Congregation (C) lines bold. One slide per spoken exchange; long prayers
  auto-split at sentence boundaries.
- **Reading slides** — title + citation + A/C response on a single strip.
  Gospel readings get a pre-announce strip ("The Holy Gospel according to St.
  Matthew, the ninth chapter…") in addition to the post-response.
- **Hymn slides** — full 1920×1080, centered title, then one or more labeled
  lyric blocks (italic verse/chorus tag above no-wrap lines), with an optional
  copyright footer.

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

Feature-complete: Upload → Review → Preview → Build is end-to-end, the hymn
library editor handles week-to-week edits, and Build emits a full OBS scene
collection — your base scenes (cameras, audio, Intro/Welcome/Thanks/Outro) with
per-section content scenes spliced in, in service order.

## More docs

- [`CLAUDE.md`](./CLAUDE.md) — agent-facing guide (stack details, conventions,
  gotchas, version control rules).
