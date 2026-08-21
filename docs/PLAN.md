# Plan

The current plan only — not history. For how we got here, see root `PLAN.md` (dated, chronological, French). Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot.

## Current

- [ ] **Fix video playback — still broken after the embed-URL rebuild, narrower cause identified.** Retest showed a native YouTube error "Error de configuración del reproductor de video" ("Ver en YouTube" button) that the app's error-scanner failed to catch (confirmed bug, now fixed — the exact text is in the marker list). Leading hypothesis for the underlying failure: missing `Referer` header on the WebView request (a prior log showed `document.referrer` was empty) — added `headers: { Referer: 'https://www.youtube.com/' }` and an `origin` query param. **Not yet verified on device.** What's left: retest and confirm the video actually plays this time; the error-scan fix at least guarantees any remaining failure will now be correctly detected and reported. See `docs/AUDIT.md` Issue #2.

## Next

- [ ] Full on-device pass across everything built this session but never confirmed working live: notation buttons respond to touch on every screen (conjugation, listening, vocab), animations play, the ☰ drawer opens/closes comfortably and its gap above doesn't look wrong, Historique displays/corrects correctly in its new Statistiques location, dark keyboard actually renders dark, tag filters in Decks & mots show a sensible number of words per tag (post `resyncWordTags`).
- [ ] Measure first-launch import time at current data volume (~6002 words + ~63,800 conjugation cards + the new per-row `resyncWordTags` UPDATE pass) — never measured on device, only reasoned about.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem (no in-app word-edit UI exists yet, only add/delete).
- [ ] Revisit the "no SQLite migration system" decision (Decision 011 in `docs/DECISIONS.md`) once the app has real on-device progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
