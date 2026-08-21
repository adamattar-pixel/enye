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

1. ~~Listening captions: pipeline confirmed working end-to-end on device.~~ **Resolved 2026-08-21.** Network interception (real PoToken-authenticated request), the `fmt=json3` parser, and the DB write (after fixing a `columnCount: 5` vs. 6-column INSERT bug in `addListeningVideo`, `mobile/src/data/database.ts`) all confirmed working on a real iPhone — user-provided logs show `xhr_intercepted` capturing real payloads across multiple videos and the user explicitly confirmed segment counts are non-zero in the app itself, not just in logs. See root `AUDIT.md`'s "Septième itération" section and `docs/specs/listening-comprehension.md`.
2. **Listening video playback — embed mechanism still unresolved, but the fallback now does what actually matters.** The `Referer` header was confirmed causing a silent redirect from `/embed/{id}` to the full `/watch` page; removed. Retesting on the corrected URL — including the universal reference video `dQw4w9WgXcQ` — still shows YouTube's native "player configuration error" screen on the real embed page itself, the cleanest evidence yet that this may be a platform limitation (Expo Go's WebView vs. YouTube's modern embedded player requirements) rather than a fixable config issue. One remaining untested variable (`origin` query param) was removed as a last targeted test, result pending. **The user then clarified the actual requirement: the mechanism doesn't matter, only that playback is bounded to the segment — which the fallback never did.** Fixed independently of the embed outcome: `ListeningReviewScreen.tsx`'s error fallback now opens the real video via `Linking.openURL` with `&t={startTime}s` (YouTube's standard, reliably-recognized start-time param) instead of a dead-end message. Known limitation, documented in the code and shown to the user: no external link can auto-stop at `endTime` — only the embedded player could do that, so the user must pause manually. See root `AUDIT.md`'s "Huitième" through "Dix-huitième itération" sections.
3. **~52% of vocabulary tags (3123/6002 words) are the `"divers"` catch-all, not a real theme** — see Decision 012. Tag-filtering in Decks & mots will show a large, semantically meaningless bucket under "divers"; this is expected given the method, not a bug to "fix" by more keyword tuning without a scoping conversation first (diminishing returns already observed).
4. **No SQLite migration system** — a bundle content update (e.g. new tags, corrected translations) does not automatically reach rows already imported on an existing install; each such case needs its own explicit resync function (see `resyncWordTags` as the first and only example so far). If a future content update touches a field with no resync path, it will silently not propagate to existing installs — worth checking for whenever the bundle content changes.
5. **CECRL level filter "B2" in Decks & mots is always empty** — the vocabulary generation heuristic (`levelForIndex` in `generate-vocabulary/generate.mjs`) only ever produces A1/A2/B1. Not fixed, not currently a priority (never reported as a problem by the user).
6. Correcting a review grade in Historique only updates the stats log (`reviews`/`conjugation_reviews`/`listening_reviews`), never the SM-2 card's already-advanced `due_date` — documented in-UI as a known limitation, not something to silently "fix" without discussing the retroactive-recompute cost.

## Unknowns

Needs investigation before being treated as fact:

- Whether performance is acceptable at current data volume (≈63,800 conjugation cards + 6002 words + a growing listening dataset) on a real device over repeated use — never measured, only reasoned about.
- Whether `resyncWordTags`'s per-row `UPDATE` loop (potentially ~6000 rows on the first run after a tag update) causes a noticeable startup delay on device — not measured.
- The speculative `get_transcript`-shaped fallback parser (`extractJsonTranscriptSegments`) is now second-priority behind the confirmed `json3` parser, but is itself still unconfirmed — kept as a fallback in case some request path returns that shape instead.
- `mobile/AGENTS.md` tells agents to check Expo SDK v57 docs before writing Expo API code, but `mobile/package.json` pins `expo": "^54.0.37"` — not reconciled; unclear whether that's a stale reference or a signal the SDK is meant to be upgraded. Don't assume v57 behavior without checking what's actually installed.
