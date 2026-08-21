# Plan

The current plan only — not history. For how we got here, see root `PLAN.md` (dated, chronological, French). Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot.

## Current

- [ ] **Fix video playback, confirmed broken on device (2026-08-21).** Two candidate fixes (`baseUrl`, then `origin`) both ruled out by evidence — a log confirms the origin is correctly `https://www.youtube.com/` yet error 152 (undocumented code) still fires, on the same test video (`lUHlckT8a44`) every time. Leading hypothesis now: video-specific (embedding disabled by owner), not a systemic player bug. **Waiting on a test with a different, known-embeddable video before writing any more code** — that result decides whether to keep debugging the player wrapper or move to the bigger fallback (loading a real `youtube.com/embed/{id}` URL instead of a synthetic HTML page). See `docs/AUDIT.md` Issue #2.

## Next

- [ ] Full on-device pass across everything built this session but never confirmed working live: notation buttons respond to touch on every screen (conjugation, listening, vocab), animations play, the ☰ drawer opens/closes comfortably and its gap above doesn't look wrong, Historique displays/corrects correctly in its new Statistiques location, dark keyboard actually renders dark, tag filters in Decks & mots show a sensible number of words per tag (post `resyncWordTags`).
- [ ] Measure first-launch import time at current data volume (~6002 words + ~63,800 conjugation cards + the new per-row `resyncWordTags` UPDATE pass) — never measured on device, only reasoned about.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem (no in-app word-edit UI exists yet, only add/delete).
- [ ] Revisit the "no SQLite migration system" decision (Decision 011 in `docs/DECISIONS.md`) once the app has real on-device progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
