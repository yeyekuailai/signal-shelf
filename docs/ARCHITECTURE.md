# Architecture

## System shape

Signal Shelf is a static website with an offline content pipeline.

```text
YouTube channels
      │
      ▼
scripts/backfill-catalog.mjs ──► assets/data/catalog-data.js
                                      │
Editorial transcript review ──► assets/js/app.js + assets/data/backfill-stories.js
                                      │
                                      ▼
scripts/generate-narration.mjs ─► assets/audio/story-<id>.mp3
                                      │
                                      ▼
                              Static GitHub Pages site
```

Visitors only receive static assets. Catalog collection, transcript review, summarization, and speech synthesis happen before publication.

## Front end

`index.html` defines the page structure. `assets/css/styles.css` provides the visual system and responsive layout. `assets/js/app.js` contains the core briefing records and client-side interactions:

- Daily Cut rendering;
- channel, beat, and date filters;
- saved-reading state in `localStorage`;
- article dialog rendering;
- audio prefetching, playback, pause, and seeking.

`assets/data/catalog-data.js` exposes the source archive as `window.SIGNAL_SHELF_CATALOG` so the site can remain serverless. Historical Daily Cut records are loaded from `assets/data/backfill-stories.js`.

## Catalog pipeline

`scripts/backfill-catalog.mjs` queries the configured channel video pages with `yt-dlp`. It collects upload date, views, duration, URL, and thumbnail, then:

1. keeps records inside the configured date window;
2. ranks videos within each channel by view count;
3. retains at most 365 videos per channel;
4. marks videos with published briefings as `ready` and the rest as `pending`;
5. writes the browser-ready catalog and a separate statistics file.

The channel roster is defined inside the script. Update that list and the corresponding `trackedAccounts` data in `assets/js/app.js` together.

## Narration pipeline

`scripts/generate-narration.mjs` reads the briefing records from `assets/js/app.js` and `assets/data/backfill-stories.js`, converts the title, lede, sections, and takeaways into semantic speech segments, and renders them locally.

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

## Deployment layout

GitHub Pages serves the repository root. `index.html` is the only production file kept at the top level; every supporting production asset lives under `assets/`. There is one canonical copy of each file and no synchronized build mirror.

## Deliberate constraints

- No database: the catalog and briefings are versioned static data.
- No runtime AI calls: summaries and audio are produced offline.
- No authentication or user profiles: saved items remain in the visitor's browser.
- No public ranking formula: creator-selection criteria are editorial operations, not site content.
- No advertising or subscription funnel: the product is a reading utility, not a lead-generation surface.

