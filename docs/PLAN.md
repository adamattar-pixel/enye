# Plan

The current plan only — not history. For how we got here, see root `PLAN.md` (dated, chronological, French). Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot.

## Current

- [ ] **Fix listening captions end-to-end.** Objective: adding a real Spanish-language video from the app produces a segment count > 0 with real transcript text. Files: `mobile/src/listening/TranscriptFetcher.tsx`, `mobile/src/listening/captions.ts`. Dependency: real on-device testing (Claude has no WebView-capable environment) — every fix in this loop needs the user to run it on their iPhone and report the diagnostic logs back. Success criteria: `[TranscriptFetcher] dom_fallback`/network-capture logs show `segmentCount > 0` for at least one real video, ideally both a manual- and auto-generated-caption video. See `docs/specs/listening-comprehension.md` for full context.
- [ ] **Confirm `react-native-webview`/IFrame Player actually renders on the user's Expo Go.** Independent of the captions problem — the player itself has never been confirmed to display/play a video on device. Blocking risk for the whole listening feature if it fails.

## Next

- [ ] Full on-device pass across everything built this session but never confirmed working live: notation buttons respond to touch on every screen (conjugation, listening, vocab), animations play, the ☰ drawer opens/closes comfortably and its gap above doesn't look wrong, Historique displays/corrects correctly in its new Statistiques location, dark keyboard actually renders dark, tag filters in Decks & mots show a sensible number of words per tag (post `resyncWordTags`).
- [ ] Measure first-launch import time at current data volume (~6002 words + ~63,800 conjugation cards + the new per-row `resyncWordTags` UPDATE pass) — never measured on device, only reasoned about.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem (no in-app word-edit UI exists yet, only add/delete).
- [ ] Revisit the "no SQLite migration system" decision (Decision 011 in `docs/DECISIONS.md`) once the app has real on-device progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
