# Architecture

## System shape

Signal Shelf is a static website with an offline content pipeline.

```text
YouTube channels
      │
      ▼
scripts/backfill-catalog.mjs ──► dist/catalog-data.js
                                      │
Editorial transcript review ──► dist/app.js (stories)
                                      │
                                      ▼
scripts/generate-narration.mjs ─► dist/audio/story-<id>.mp3
                                      │
                                      ▼
                              Static GitHub Pages site
```

Visitors only receive static assets. Catalog collection, transcript review, summarization, and speech synthesis happen before publication.

## Front end

`dist/index.html` defines the page structure. `dist/styles.css` provides the visual system and responsive layout. `dist/app.js` contains the briefing records and client-side interactions:

- Daily Cut rendering;
- channel, beat, and date filters;
- saved-reading state in `localStorage`;
- article dialog rendering;
- audio prefetching, playback, pause, and seeking.

`dist/catalog-data.js` exposes the source archive as `window.SIGNAL_SHELF_CATALOG` so the site can remain serverless.

## Catalog pipeline

`scripts/backfill-catalog.mjs` queries the configured channel video pages with `yt-dlp`. It collects upload date, views, duration, URL, and thumbnail, then:

1. keeps records inside the configured date window;
2. ranks videos within each channel by view count;
3. retains at most 365 videos per channel;
4. marks videos with published briefings as `ready` and the rest as `pending`;
5. writes the browser-ready catalog and a separate statistics file.

The channel roster is defined inside the script. Update that list and the corresponding `trackedAccounts` data in `dist/app.js` together.

## Narration pipeline

`scripts/generate-narration.mjs` reads the briefing records from `dist/app.js`, converts the title, lede, sections, and takeaways into semantic speech segments, and renders them locally.

The current audio profile is:

- Kokoro 82M ONNX, `q8`, CPU inference;
- `af_heart` female voice;
- fixed 1× speed;
- 24 kHz mono;
- 64 kbit/s MP3;
- 10 ms fades at segment boundaries;
- peak limited to 0.89 amplitude;
- short pauses between segments and a longer final pause.

Pre-rendering avoids client-side model downloads, device-dependent inference, and the crackling that occurred during quantized real-time browser synthesis. The page prefetches up to three Daily Cut audio files during idle time and loads the selected article with `preload="auto"`.

## Deployment directories

`dist/` is the canonical static build and is also the directory configured in `.openai/hosting.json`. GitHub Pages currently serves the repository root. The root copies of `index.html`, `app.js`, `styles.css`, images, catalog data, and `audio/` are therefore deployment mirrors rather than a second source of truth.

Always edit `dist/` first. Mirror to the root only as a publication step.

## Deliberate constraints

- No database: the catalog and briefings are versioned static data.
- No runtime AI calls: summaries and audio are produced offline.
- No authentication or user profiles: saved items remain in the visitor's browser.
- No public ranking formula: creator-selection criteria are editorial operations, not site content.
- No advertising or subscription funnel: the product is a reading utility, not a lead-generation surface.

