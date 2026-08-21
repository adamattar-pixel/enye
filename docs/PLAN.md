# Plan

The current plan only — not history. For how we got here, see root `PLAN.md` (dated, chronological, French). Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot.

## Current

- [ ] **Confirm the DOM-click captions fix — three prior fixes to this bug have all failed.** Current fix clicks the player's own CC toggle button directly (`.ytp-subtitles-button`), polled continuously. Newly at risk: `controls: false` (added same session, see below) may remove this button from the DOM — if captions reappear, check that interaction first.
- [ ] **Confirm millisecond-precision segment bounds and the `replay()` fix.** YouTube's `start`/`end` params only support whole seconds; the player now self-corrects via `seekTo`/`getCurrentTime` polling. `replay()` now force-remounts the player instead of calling `seekTo` alone (which never resumes playback if paused).
- [ ] **Confirm the strict Spanish-only transcript filter.** A prior "accept any language if no Spanish arrives" fallback was itself causing Arabic/English imports — removed; non-Spanish network captures are now always rejected (0 segments) rather than imported.
- [ ] **Confirm the hidden-chrome player (`controls: false`)** shows only the video frame as requested — no native pause/seek now, only the app's "Réécouter" button.
- [ ] **Confirm the mute-then-unmute autoplay fix.** User had to manually tap YouTube's own play button every segment — a known WebKit/iOS restriction (unmuted autoplay blocked without a user gesture, muted autoplay allowed). Fixed: starts muted, unmutes once `onChangeState` reports `'playing'`.

See `docs/AUDIT.md` Issue #2.

## Next

- [ ] Full on-device pass across everything built this session but never confirmed working live: notation buttons respond to touch on every screen (conjugation, listening, vocab), animations play, the ☰ drawer opens/closes comfortably and its gap above doesn't look wrong, Historique displays/corrects correctly in its new Statistiques location, dark keyboard actually renders dark, tag filters in Decks & mots show a sensible number of words per tag (post `resyncWordTags`).
- [ ] Measure first-launch import time at current data volume (~6002 words + ~63,800 conjugation cards + the new per-row `resyncWordTags` UPDATE pass) — never measured on device, only reasoned about.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem (no in-app word-edit UI exists yet, only add/delete).
- [ ] Revisit the "no SQLite migration system" decision (Decision 011 in `docs/DECISIONS.md`) once the app has real on-device progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
