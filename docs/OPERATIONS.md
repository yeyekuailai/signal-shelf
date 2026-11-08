# Operations and Deployment

## Install

```bash
npm install
```

The narration tool uses `kokoro-js` and the bundled `ffmpeg-static` binary. The first narration run may download model files into the local model cache; website visitors never download them.

## Run locally

```bash
python3 -m http.server 4173 --directory dist
```

Open `http://127.0.0.1:4173/`. Test through HTTP rather than opening `index.html` directly so audio loading and relative paths behave like production.

## Refresh the source archive

Install `yt-dlp`, then run:

```bash
node scripts/backfill-catalog.mjs
```

Example: rebuild one quarter with conservative concurrency.

```bash
ARCHIVE_START=20260101 \
ARCHIVE_END=20260401 \
ARCHIVE_CONCURRENCY=2 \
ARCHIVE_PER_CHANNEL_CAP=365 \
node scripts/backfill-catalog.mjs
```

Review `work/catalog-stats.json` and spot-check the resulting `dist/catalog-data.js` before publication.

## Generate narration

Generate only missing files:

```bash
npm run generate:narration
```

Regenerate a specific story after editing its copy:

```bash
npm run generate:narration -- <story-id>
```

The targeted form overwrites the existing MP3. The all-story form skips non-empty files, so delete or explicitly target an outdated narration file when the briefing changes.

## Audio quality checks

For each changed narration:

- confirm the file decodes without errors;
- check that peaks remain below 0 dBFS;
- listen for clipped consonants, segment-boundary pops, long dead air, and incorrect pronunciations;
- verify that the article's Play/Pause button and progress slider control the correct file;
- test one cold load and one cached load.

Published audio belongs in both `dist/audio/` and the root `audio/` mirror.

## GitHub Pages synchronization

GitHub Pages currently publishes the repository root. Before committing a release, synchronize these paths from `dist/`:

```text
dist/index.html          -> index.html
dist/app.js              -> app.js
dist/styles.css          -> styles.css
dist/catalog-data.js     -> catalog-data.js
dist/favicon.png         -> favicon.png
dist/signal-shelf-logo.png -> signal-shelf-logo.png
dist/audio/              -> audio/
```

Do not edit both copies independently. `dist/` is canonical; root files are the deploy mirror.

## Release checklist

1. Refresh and review the catalog if source data changed.
2. Review every new or edited briefing against its transcript.
3. Generate or regenerate narration.
4. Run the site locally.
5. Test filters, dates, article dialogs, source links, audio controls, and console output.
6. Synchronize the root GitHub Pages mirror.
7. Commit both the canonical and mirrored files.
8. Push to `main`.
9. Wait for GitHub Pages to update.
10. Open the public site with a cache-busting query and repeat the audio smoke test.

## Troubleshooting

### The live site still shows old JavaScript

Check whether only `dist/` was updated. GitHub Pages reads the root mirror. Also change the asset query string in `index.html` when browser caching needs to be invalidated.

### Narration takes a long time to generate

Generation is intentionally offline and CPU-based for stable quality. Generate only the changed story with its ID.

### Visitors see a narration download delay

They should receive only a 1–2 MB MP3, not the model. Confirm that `index.html` does not load `tts-engine.js`, the MP3 exists at `audio/story-<id>.mp3`, and the page creates the three idle prefetch links.

### Narration crackles or clips

Do not restore real-time browser inference. Regenerate the MP3, verify its peak level and decoder output, and inspect sentence segmentation and boundary fades.

