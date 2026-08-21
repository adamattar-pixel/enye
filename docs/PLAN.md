# Plan

The current plan only — not history. For how we got here, see root `PLAN.md` (dated, chronological, French). Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot.

## Current

- [ ] **Confirm the listening-captions fix works end-to-end.** Network interception (PoToken-authenticated request) and the `fmt=json3` parser are both confirmed working on device as of 2026-08-21 — real caption payloads up to ~500KB were captured and parsed across multiple videos. A second bug then surfaced downstream: `addListeningVideo` (`mobile/src/data/database.ts`) passed `columnCount: 5` to `insertInBatches` for a 6-column `listening_segments` INSERT, causing `Error code 1: 5 values for 6 columns` on every add attempt. Fixed (`5` → `6`), verified via `tsc`/`jest`/bundle boot-check — **not yet reconfirmed on device.** What's left: re-test adding a video and confirm the app itself shows `segments > 0`, not just the logs. Files: `mobile/src/listening/transcriptParsing.ts`, `mobile/src/listening/TranscriptFetcher.tsx`, `mobile/src/data/database.ts`. Dependency: real on-device testing (Claude has no WebView-capable environment). See `docs/specs/listening-comprehension.md` for full context.
- [ ] **Confirm `react-native-webview`/IFrame Player actually renders on the user's Expo Go.** Independent of the captions problem — the player itself has never been confirmed to display/play a video on device. Blocking risk for the whole listening feature if it fails.

## Next

- [ ] Full on-device pass across everything built this session but never confirmed working live: notation buttons respond to touch on every screen (conjugation, listening, vocab), animations play, the ☰ drawer opens/closes comfortably and its gap above doesn't look wrong, Historique displays/corrects correctly in its new Statistiques location, dark keyboard actually renders dark, tag filters in Decks & mots show a sensible number of words per tag (post `resyncWordTags`).
- [ ] Measure first-launch import time at current data volume (~6002 words + ~63,800 conjugation cards + the new per-row `resyncWordTags` UPDATE pass) — never measured on device, only reasoned about.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem (no in-app word-edit UI exists yet, only add/delete).
- [ ] Revisit the "no SQLite migration system" decision (Decision 011 in `docs/DECISIONS.md`) once the app has real on-device progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
