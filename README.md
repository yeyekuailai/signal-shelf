# Signal Shelf

Signal Shelf turns long-form YouTube videos from high-reach U.S. creators and editorial channels into substantial English briefings that can be read—or heard—in a few minutes.

**Live site:** [yeyekuailai.github.io/signal-shelf](https://yeyekuailai.github.io/signal-shelf/)

## What the site does

- Tracks 18 U.S.-based channels across AI & Tech, Investment Banking, and Supply Chain.
- Stores verified uploads from January 1, 2026 onward, capped at 365 videos per channel per year. When a channel exceeds the cap, the 365 highest-viewed videos are retained.
- Publishes transcript-grounded Daily Cut briefings with arguments, evidence, caveats, takeaways, and timestamped links to the original video.
- Filters the source archive by channel, beat, and upload date.
- Provides pre-rendered female narration with play/pause and seeking. Visitors stream a small MP3 instead of downloading a speech model or synthesizing audio in the browser.

## Repository map

| Path | Purpose | Commit policy |
| --- | --- | --- |
| `dist/` | Canonical static site: HTML, CSS, JavaScript, catalog, images, and narration | Commit |
| `dist/audio/` | Pre-rendered briefing narration | Commit |
| `scripts/` | Catalog collection and narration-generation tools | Commit |
| `docs/` | Architecture, editorial workflow, and operating notes | Commit |
| `work/` | Generated statistics, experiments, and temporary research outputs | Review before committing |
| repository root static files | GitHub Pages mirror of `dist/` | Keep synchronized with `dist/` |
| `node_modules/` | Installed dependencies | Never commit |

GitHub Pages currently publishes from the repository root, while the project configuration treats `dist/` as the canonical site directory. Any production change must therefore be made in `dist/` first and then mirrored to the root before publishing. See [Operations](docs/OPERATIONS.md).

## Local setup

Requirements:

- Node.js 20 or newer
- npm
- Python 3 for the local static server
- `yt-dlp` only when rebuilding the YouTube catalog

```bash
npm install
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173/`.

This is a static site. There is no application server, database, login system, or client-side API key.

## Content workflow

### 1. Refresh the source catalog

```bash
node scripts/backfill-catalog.mjs
```

Useful environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ARCHIVE_START` | `20260101` | Inclusive archive start in `YYYYMMDD` format |
| `ARCHIVE_END` | `20261108` | Exclusive archive end in `YYYYMMDD` format |
| `ARCHIVE_CONCURRENCY` | `3` | Concurrent channel workers |
| `ARCHIVE_PER_CHANNEL_CAP` | `365` | Maximum retained videos per channel |
| `YT_DLP_BIN` | `yt-dlp` | Path to the `yt-dlp` executable |
| `CATALOG_OUTPUT` | `dist/catalog-data.js` | Catalog output path |

The collector shortlists uploads, resolves detailed metadata, sorts each channel by views, applies the annual cap, and writes the browser-ready catalog.

### 2. Add or edit a briefing

Briefings currently live in the `stories` array at the top of `dist/app.js`. Each story contains:

- publication and source metadata;
- a substantial lede and sectioned summary;
- takeaways;
- timestamped evidence links;
- channel and category information.

Editorial requirements are documented in [Content Workflow](docs/CONTENT_WORKFLOW.md).

### 3. Generate narration

Generate every missing narration file:

```bash
npm run generate:narration
```

Regenerate one story, replacing its existing audio:

```bash
npm run generate:narration -- 3
```

Narration is generated locally with Kokoro `af_heart` at 1× speed, encoded as 24 kHz mono MP3, peak-limited, and given short fades and semantic pauses. Output is written to `dist/audio/story-<id>.mp3`.

### 4. Verify locally

Before publishing, check that:

- the selected Daily Cut contains the expected briefings;
- channel, beat, and date filters work;
- every article opens and links to its source;
- narration reaches `ready`, starts promptly, pauses, seeks, and finishes cleanly;
- the browser console contains no warnings or errors;
- root publishing files match their `dist/` counterparts.

### 5. Publish

Push the synchronized root and `dist/` files to `main`. GitHub Pages updates the public site automatically.

The detailed release checklist is in [Operations](docs/OPERATIONS.md).

## Technical overview

- Static HTML, CSS, and vanilla JavaScript
- YouTube metadata collected with `yt-dlp`
- Offline narration generated with `kokoro-js`
- MP3 encoding through `ffmpeg-static`
- GitHub Pages hosting
- No runtime analytics, advertising, subscriptions, or lead-generation forms

See [Architecture](docs/ARCHITECTURE.md) for data flow and design decisions.

## Editorial and rights notice

Signal Shelf is an editorial reading layer, not a replacement for the original creators. Video rights remain with their owners. Briefings are source-derived synthesis based on the video transcript and linked evidence; they are not independent fact-checking.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Content workflow](docs/CONTENT_WORKFLOW.md)
- [Operations and deployment](docs/OPERATIONS.md)

