# Audit — current state

Snapshot as of 2026-08-21. This is a *current-state* summary, not a changelog — update this file when the state changes significantly, overwriting stale entries rather than appending history. (A separate dated, chronological root `AUDIT.md` existed earlier in the project but was merged away on 2026-08-21 to avoid maintaining two files per topic — this file is now the only one.)

## Facts

Verified directly from the code/tooling, not assumed:

- `mobile/` (Expo SDK 54, RN 0.81.5, TS strict) is the only actively developed app; `Packages/` (Swift) is frozen as reference spec, not touched.
- No CI/CD is configured (no workflow files). No lint script in `package.json` — only `tsc --noEmit` and `jest`.
- `mobile/src/data/database.ts` has **zero automated test coverage** — no SQLite in-memory double exists under jest-expo. Every DB function is verified only by type-checking, never by execution, until a human confirms on-device.
- Test suite: 107 tests total, 103 pass. The 4 failures are all in `mobile/src/scheduler/reviewScheduler.test.ts`, pre-existing (not caused by any change made this session), and appear to be a timezone/environment artifact (~2h offset in expected vs. actual dates) — not a real scheduling bug as far as has been established.
- `mobile/src/data/words.json` holds 6002 words; as of the latest tagging pass, all 6002 carry at least one theme tag (0 untagged) — see Issues below for what that coverage actually means.
- `react-native-webview` is installed and resolves cleanly (`expo-doctor` 18/18), used for the listening-caption-fetch mechanism directly and as a peer dependency of `react-native-youtube-iframe` (2026-08-21) for video playback — both are pure-JS/WebView packages with no native config, Expo Go compatible.
- Notifications' two-stage flow (word → "Ver traducción" → translation + grade buttons) **has been confirmed working on a real iPhone**, with one documented limit: after a user force-quits the app, no code runs in the background until the app is reopened manually (Apple platform behavior, not a bug).
- Decks & mots (2026-08-21) now supports editing `english`/`exampleEn`/tags/level for any word via `updateWord` (plain SQLite `UPDATE`), plus a "Mots ajoutés seulement" filter — both implemented and compiled, **not yet verified on device**.

## Issues

Real, identified problems — not hypothetical:

1. ~~Listening captions and video playback broken.~~ **Resolved and confirmed working end-to-end on a real iPhone (2026-08-21).** Captions: network interception of YouTube's own authenticated `timedtext` request (via a WebView loading the real watch page), the `fmt=json3` parser, and the SQLite write all confirmed working; transcript language is now strictly verified as Spanish (`lang=es*` in the intercepted URL) — a non-Spanish capture is never accepted, the video is marked `unavailable` (0 segments) instead. Playback: after 18 failed fix iterations on a homegrown WebView player, replaced with the community library `react-native-youtube-iframe` (Decision 014) — confirmed working, including closed-captions-disabled (DOM click on the player's CC button), millisecond-precise segment start/end (via `seekTo`/`getCurrentTime`, since YouTube's `start`/`end` params only support whole seconds), a hidden native control bar (`controls: false`, video-only), and autoplay without a manual tap (mute-then-unmute-once-playing, working around a WebKit/iOS restriction on unmuted autoplay). See `docs/specs/listening-comprehension.md` and Decision 014 for full detail.
2. **~52% of vocabulary tags (3123/6002 words) are the `"divers"` catch-all, not a real theme** — see Decision 012. Tag-filtering in Decks & mots will show a large, semantically meaningless bucket under "divers"; this is expected given the method, not a bug to "fix" by more keyword tuning without a scoping conversation first (diminishing returns already observed).
3. **No SQLite migration system** — a bundle content update (e.g. new tags, corrected translations) does not automatically reach rows already imported on an existing install; each such case needs its own explicit resync function (see `resyncWordTags` as the first and only example so far). If a future content update touches a field with no resync path, it will silently not propagate to existing installs — worth checking for whenever the bundle content changes.
4. **CECRL level filter "B2" in Decks & mots is always empty** — the vocabulary generation heuristic (`levelForIndex` in `generate-vocabulary/generate.mjs`) only ever produces A1/A2/B1. Not fixed, not currently a priority (never reported as a problem by the user).
5. Correcting a review grade in Historique only updates the stats log (`reviews`/`conjugation_reviews`/`listening_reviews`), never the SM-2 card's already-advanced `due_date` — documented in-UI as a known limitation, not something to silently "fix" without discussing the retroactive-recompute cost.

## Unknowns

Needs investigation before being treated as fact:

- Whether performance is acceptable at current data volume (≈63,800 conjugation cards + 6002 words + a growing listening dataset) on a real device over repeated use — never measured, only reasoned about. `resyncWordTags` was batched into `UPDATE...CASE` (2026-08-21, was one round-trip per row) and every `FlatList` in the app (`DecksScreen`, `ConjugationScreen`, `StatsScreen`, `ListeningScreen`) got memoized row components + `useCallback`'d `renderItem`, but none of this has been measured on device — code-level improvements, not confirmed perceptible ones.
- The speculative `get_transcript`-shaped fallback parser (`extractJsonTranscriptSegments`) is now second-priority behind the confirmed `json3` parser, but is itself still unconfirmed — kept as a fallback in case some request path returns that shape instead.
- `mobile/AGENTS.md` tells agents to check Expo SDK v57 docs before writing Expo API code, but `mobile/package.json` pins `expo": "^54.0.37"` — not reconciled; unclear whether that's a stale reference or a signal the SDK is meant to be upgraded. Don't assume v57 behavior without checking what's actually installed.
