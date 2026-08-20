# Audit — current state

Snapshot as of 2026-08-21. This is a *current-state* summary, not a changelog — for the full dated history of how the project got here, see root `AUDIT.md` (verbose, chronological, French). Update this file when the state changes significantly; don't append history here.

## Facts

Verified directly from the code/tooling, not assumed:

- `mobile/` (Expo SDK 54, RN 0.81.5, TS strict) is the only actively developed app; `Packages/` (Swift) is frozen as reference spec, not touched.
- No CI/CD is configured (no workflow files). No lint script in `package.json` — only `tsc --noEmit` and `jest`.
- `mobile/src/data/database.ts` has **zero automated test coverage** — no SQLite in-memory double exists under jest-expo. Every DB function is verified only by type-checking, never by execution, until a human confirms on-device.
- Test suite: 95 tests total, 91 pass. The 4 failures are all in `mobile/src/scheduler/reviewScheduler.test.ts`, pre-existing (not caused by any change made this session), and appear to be a timezone/environment artifact (~2h offset in expected vs. actual dates) — not a real scheduling bug as far as has been established.
- `mobile/src/data/words.json` holds 6002 words; as of the latest tagging pass, all 6002 carry at least one theme tag (0 untagged) — see Issues below for what that coverage actually means.
- `react-native-webview` is installed and resolves cleanly (`expo-doctor` 18/18), used for both the YouTube player and the listening-caption-fetch mechanism.
- Notifications' two-stage flow (word → "Ver traducción" → translation + grade buttons) **has been confirmed working on a real iPhone**, with one documented limit: after a user force-quits the app, no code runs in the background until the app is reopened manually (Apple platform behavior, not a bug).

## Issues

Real, identified problems — not hypothetical:

1. **Listening captions: the hard problem is solved, the last confirmation isn't in yet.** Real on-device logs (2026-08-21) show the network-interception mechanism actually works — the "Show transcript" button is found and clicked, and a real 858,225-character caption payload was intercepted (URL carried a `pot`/`potc` PoToken param, confirming the whole approach). The app still reported "0 segments" because the payload was in YouTube's `fmt=json3` shape, which the parser didn't recognize (it only handled a speculative, never-observed `get_transcript` shape). A `parseJson3Captions` parser has been added and unit-tested against a fixture built from the real payload's structure — **but that fix itself hasn't been reverified on device yet.** See `docs/specs/listening-comprehension.md` and root `AUDIT.md`'s "Cinquième itération" section. **Don't present this feature as fully working until a device test shows segments > 0 from the real fetch, not just the unit test.**
2. **~52% of vocabulary tags (3123/6002 words) are the `"divers"` catch-all, not a real theme** — see Decision 012. Tag-filtering in Decks & mots will show a large, semantically meaningless bucket under "divers"; this is expected given the method, not a bug to "fix" by more keyword tuning without a scoping conversation first (diminishing returns already observed).
3. **No SQLite migration system** — a bundle content update (e.g. new tags, corrected translations) does not automatically reach rows already imported on an existing install; each such case needs its own explicit resync function (see `resyncWordTags` as the first and only example so far). If a future content update touches a field with no resync path, it will silently not propagate to existing installs — worth checking for whenever the bundle content changes.
4. **CECRL level filter "B2" in Decks & mots is always empty** — the vocabulary generation heuristic (`levelForIndex` in `generate-vocabulary/generate.mjs`) only ever produces A1/A2/B1. Not fixed, not currently a priority (never reported as a problem by the user).
5. Correcting a review grade in Historique only updates the stats log (`reviews`/`conjugation_reviews`/`listening_reviews`), never the SM-2 card's already-advanced `due_date` — documented in-UI as a known limitation, not something to silently "fix" without discussing the retroactive-recompute cost.

## Unknowns

Needs investigation before being treated as fact:

- Whether `react-native-webview`/the YouTube IFrame Player actually renders and plays inside the user's installed Expo Go (SDK 54) — never confirmed on device. This was flagged during planning as the single most blocking risk for the whole listening feature; the WebView clearly *runs* JS and makes network requests successfully now (confirmed by the captions interception working), but actual video playback specifically hasn't been directly observed.
- Whether `parseJson3Captions` (`mobile/src/listening/transcriptParsing.ts`), now unit-tested against a hand-built fixture, produces correct output when run against the *real* 858KB captured payload — the fixture matches the documented json3 shape but wasn't built from the actual bytes captured on device.
- Whether performance is acceptable at current data volume (≈63,800 conjugation cards + 6002 words + a growing listening dataset) on a real device over repeated use — never measured, only reasoned about.
- Whether `resyncWordTags`'s per-row `UPDATE` loop (potentially ~6000 rows on the first run after a tag update) causes a noticeable startup delay on device — not measured.
- The speculative `get_transcript`-shaped fallback parser (`extractJsonTranscriptSegments`) is now second-priority behind the confirmed `json3` parser, but is itself still unconfirmed — kept as a fallback in case some request path returns that shape instead.
- `mobile/AGENTS.md` tells agents to check Expo SDK v57 docs before writing Expo API code, but `mobile/package.json` pins `expo": "^54.0.37"` — not reconciled; unclear whether that's a stale reference or a signal the SDK is meant to be upgraded. Don't assume v57 behavior without checking what's actually installed.
