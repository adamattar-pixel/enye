# Plan

The current plan only — not history. Update this file whenever the plan changes; delete finished/obsolete items instead of leaving them to rot.

## Current

- [x] **Desktop migration (Decision 016)** — Electron (Windows) wrapping an Expo Web export, iOS/Expo Go abandoned. See `docs/DECISIONS.md` Decision 016 for the full reasoning/target comparison. Implementation status below.

Feature-parity result (final, not a prediction):

| Feature | Status | Note |
|---|---|---|
| SM-2 (vocabulaire, conjugaison, expressions, compréhension écrite) | Adapté | DB access layer swapped (`node:sqlite` via IPC instead of `expo-sqlite`), zero change to `sm2/`, `scheduler/`, or any review logic. |
| Decks & mots (édition `updateWord`, filtres) | Adapté | Same DB-layer swap; UI/logic unchanged. |
| Écoute — sous-titres | Réécrit | `electron/captionsFetcher.ts` + `captionsPreload.ts` — hidden Electron `BrowserWindow`, same injected scripts (network patch, click, DOM fallback) as the mobile WebView mechanism, same `transcriptParsing.ts`. Not yet exercised against a real video on this machine (see `docs/AUDIT.md`). |
| Écoute — lecture vidéo | Réécrit (plus simple qu'avant) | `react-native-youtube-iframe` dropped for the official YouTube IFrame Player JS API called directly — no WebView wrapper needed on a real browser/Electron renderer. The DOM-click CC-disable fallback used on iOS has no cross-origin-safe equivalent here; only the official API calls remain. |
| Livres — parsing EPUB (`jszip`, `books/parsing.ts`) | Marche tel quel | Untouched, pure TS/JS, no RN import. |
| Livres — import de fichier | Inchangé (pas de régression) | Mobile never had a local file picker either (URL/search-add only) — nothing to port. A native `dialog.showOpenDialog` picker would be a real desktop-only upgrade, not built yet. |
| Livres — traduction DeepL / recherche Open Library | Adapté | Both confirmed CORS-blocked from a browser `fetch` (direct header inspection) — moved to the Electron main process, reached via IPC (`translateIpc.ts`, `bookImportIpc.ts`); original service files unchanged, just relocated to running in the main process. |
| Historique / stats / "Réinitialiser ma progression" | Adapté | DB-layer swap only. |
| Rappels de révision | Perdu, remplacé | `mobile/src/notifications/` deleted; replaced by the due-card count already shown on the Aujourd'hui tab (first tab opened) plus a "Rappel" sub-tab in Réglages (was "Notifications"). |

Verification actually performed (see `docs/AUDIT.md` Facts for the full detail — this is a summary):
- `tsc --noEmit` (app) and `tsc -p electron/tsconfig.json` (main process) both clean; `jest` 129/129.
- Electron actually launched on this machine twice (fresh install + reopen): real window, real `node:sqlite` file, row counts confirmed by querying the `.db` file directly (6002 words / 63804 conjugation cards / 60 expressions / 15 reading cards, identical both times — confirms idempotent reimport on the new backend).
- `npm run desktop:package` produced a real `Lexis.exe` + NSIS installer under `release/` (one real bug hit and fixed: `electron-builder` and Expo both read `package.json`'s `"main"` field — fixed via `extraMetadata.main`, not by touching Expo's own field).
- **Not verified**: the installer was not run/installed; the app's UI was not visually inspected (no screenshot/browser-automation tool available this session); captions-fetch and DeepL/Open Library were not exercised against real network data (no `.env` DeepL key configured, no video added).

## Next

- [x] ~~Open the app and actually look at it.~~ Done 2026-09-06 by the user — app opens, is usable. Two visual issues reported and fixed (ugly default scrollbar, flattened buttons in Decks & mots) — see `docs/AUDIT.md`, not yet re-confirmed visually.
- [ ] **Listening captions are blocked by a Google CAPTCHA wall — see `docs/AUDIT.md` Issues #1 for the full diagnosis.** Not a code bug: a direct, UI-bypassing test confirmed `youtube.com/watch` redirects straight to a `google.com/sorry/...` challenge before any of our scripts run, independent of User-Agent. Next real step: a human, single, patient attempt from the actual app (not another automated retry — this session's own repeated tests are a plausible contributor to the IP being flagged). If it's still blocked under normal use, this needs a conversation about whether to accept the risk, investigate session/cookie persistence, or treat this as a feature that may not be reliably portable to this network/environment.
- [ ] Confirm closed captions actually stay off during playback — moot until captions-fetch itself works.
- [ ] Configure a real DeepL key in `mobile/.env` and confirm translation actually works end-to-end through the new main-process IPC path (never called with a real key even before the migration).
- [ ] Try installing the packaged `release/` output (not just running `win-unpacked/Lexis.exe` directly) to confirm the NSIS installer itself works.
- [ ] Update `CLAUDE.md`'s "Active stack" section to describe the desktop target — already done 2026-09-04, re-check once captions/DeepL are resolved in case the framing needs another pass.

## Later

- [ ] Decide whether to keep chasing `"divers"` tag coverage down (currently ~52% of all words) or accept it as a documented limitation — needs a scoping conversation, not more unprompted keyword tuning (diminishing returns already observed: −13% for the last full pass).
- [ ] "B2" CECRL level filter in Decks & mots is always empty (generation heuristic never outputs B2) — not fixed, no priority unless requested.
- [ ] Verbose grammatical-word glosses (pronouns/determiners/prepositions) in generated vocabulary — no automatic fix planned, correctable case-by-case if a specific word is reported as a problem.
- [ ] Revisit the "no SQLite migration system" decision (Decision 011) once the desktop app has real progress worth preserving — a silent-data-loss migration path won't be acceptable at that point.
- [ ] A native file-picker for local EPUB/TXT/HTML import (Electron's `dialog.showOpenDialog`) — a genuine desktop-only upgrade over the mobile app's URL/search-only add flow, not built yet, not requested either.
