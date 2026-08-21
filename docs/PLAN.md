# Plan

The current plan only — not history. Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot. (A separate dated, chronological root `PLAN.md` existed earlier in the project but was merged away on 2026-08-21 to avoid maintaining two files per topic — this file is now the only one.)

## Current

- [x] **Word editing in Decks & mots** (requested 2026-08-21): `updateWord` (`database.ts`) — plain `UPDATE` on `english`/`example_en`/`tags`/`level`, works for any word (imported or user-added), no new table. `EditWordModal` in `DecksScreen.tsx`, opened via an "Éditer" link on every row. Deletion untouched — still restricted to user-added words only. "Mots ajoutés seulement" filter chip added, reusing the existing `is_user_added` column (also extended `WordFilter`/`getAllWords` with `userAddedOnly`). Implemented and compiled (`tsc`/`jest`/bundle boot-check all clean) — **not yet verified on device.**
- [ ] **General code optimization pass** (requested 2026-08-21): `resyncWordTags` batched into `UPDATE...CASE` (was one round-trip per row, same class of fix as `insertInBatches`); `DecksScreen`/`ConjugationScreen` history `FlatList`s given memoized row components + `useCallback`'d `renderItem` (was recreating render closures — and therefore risking re-rendering all visible rows — on every unrelated state change, notable on `DecksScreen`'s up-to-6002-word list). `StatsScreen`/`ListeningScreen` FlatLists not yet done — same pattern, lower priority (bounded/small lists).

## Next

- [ ] Full on-device pass across everything built this session but never confirmed working live: notation buttons respond to touch on every screen (conjugation, listening, vocab), animations play, the ☰ drawer opens/closes comfortably and its gap above doesn't look wrong, Historique displays/corrects correctly in its new Statistiques location, dark keyboard actually renders dark, tag filters in Decks & mots show a sensible number of words per tag (post `resyncWordTags`).
- [ ] Measure first-launch import time at current data volume (~6002 words + ~63,800 conjugation cards + the batched `resyncWordTags` UPDATE pass) — never measured on device, only reasoned about.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem (word editing exists now — Decks & mots — but only for `english`/`exampleEn`/tags/level, not `partOfSpeech`, which is where the verbose gloss actually lives).
- [ ] Revisit the "no SQLite migration system" decision (Decision 011 in `docs/DECISIONS.md`) once the app has real on-device progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
