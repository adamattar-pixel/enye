# CLAUDE.md

Entry point for Claude Code sessions on this repo. Keep this file short — details live in `docs/`.

## Project

**Lexis** — a Spanish→English vocabulary/grammar learning app on the Anki/SM-2 model, meant to be driven mostly from lock-screen notifications rather than the app itself. French user, French-language docs and commit messages throughout.

## Active stack

**`mobile/`** (Expo/React Native/TypeScript) is the actively developed app. Started as native iOS (Swift/SwiftUI/SwiftData, see `Packages/`), pivoted to Expo because development happens on Windows without a Mac or paid Apple developer account. The native Swift packages (`Packages/SM2Engine`, `Packages/ReviewScheduler`) are not deleted — they're the reference spec the TypeScript port was tested against — but they are not where you add features.

**Do not work in `Packages/` unless explicitly asked.** All active work is in `mobile/`.

`mobile/AGENTS.md` (auto-loaded via `mobile/CLAUDE.md` when working inside `mobile/`) carries one standing rule worth knowing about even from the repo root: check the versioned Expo docs before writing Expo-API code, because the SDK has changed from under this project before.

## Essential commands

Run from `mobile/`:
```
npx expo start              # dev server; scan the QR code with Expo Go on the same Wi-Fi
npx jest --watchAll=false    # run tests once (npm test = watch mode)
npx tsc --noEmit             # type-check
```
There is no CI/CD configured — these three commands are the only automated verification available. There is no lint script configured either.

## Critical constraints

- **Everything must run offline, inside Expo Go — no development build.** No native dependency that would force `eas build`/Xcode. If a task seems to need one, stop and flag it before writing code.
- Notifications are **local only** (`expo-notifications`) — no push, no server, no backend of any kind.
- iOS caps pending local notifications at 64 — the app uses a sliding queue (~50), refilled on app open and after each grade.
- The listening (Compréhension Orale) feature is the one deliberate exception to "fully offline": it needs network to fetch YouTube pages inside a `WebView`. See `docs/specs/listening-comprehension.md`.
- No test coverage exists for `mobile/src/data/database.ts` or anything touching SQLite directly — `expo-sqlite` has no in-memory test double available under Jest. Verify DB-touching changes manually on device; don't claim they're tested.
- Nothing in this repo has been verified on a real device by Claude directly — verification claims in this codebase mean `tsc`/`jest`/Metro-bundle-boots, never "confirmed working on iPhone" unless a human reports back with real logs.

## Architecture, in one paragraph

SQLite (`expo-sqlite`) is the single source of truth for content + progress for vocabulary and conjugation (words/verbs bundled as JSON, imported into SQLite on first run and incrementally topped up on updates); the listening feature has no bundled content — users add videos at runtime, so SQLite holds everything for it. A single generic SM-2 engine (`mobile/src/sm2/`) grades all three content types via different card-id schemes. Six screens live behind a hamburger-drawer nav (`mobile/src/navigation/`), each internally split into sub-tabs where relevant (Réglages, Conjugaison, Écoute, Statistiques). See `docs/ARCHITECTURE.md` for the real breakdown.

## Where to look

| Need | File |
|---|---|
| How the system is actually built | `docs/ARCHITECTURE.md` |
| Why a technical choice was made | `docs/DECISIONS.md` |
| What's being worked on right now | `docs/PLAN.md`, `docs/TODO.md` |
| Current known issues / unverified claims | `docs/AUDIT.md` |
| Code style, naming, testing conventions | `docs/CONVENTIONS.md` |
| Full requirements for a specific feature | `docs/specs/` |
| **Full dated history of every change this project has ever had** (verbose, changelog-style, French) | root `PLAN.md` and `AUDIT.md` — these predate the `docs/` structure and remain the detailed journal; `docs/PLAN.md`/`docs/AUDIT.md` are current-state snapshots derived from them, not replacements |

## Working rules for this repo

- **Confirm real bugs with a live test before fixing them**, and confirm fixes worked before calling them done — this project has a strong pattern (established across many sessions) of live-testing hypotheses (via `curl`/Node scripts for network behavior, asking the user to test on-device for anything UI/WebView-related) rather than guessing. Never write "fixed" or "resolved" for anything not actually confirmed working.
- **Ask when genuinely ambiguous** rather than guessing on UI/UX requests — this user has repeatedly preferred a clarifying question (with concrete options/mockups) over a wrong guess.
- Update `docs/` (and the relevant root `PLAN.md`/`AUDIT.md` entry, dated, French, with a `tsc`/`jest`/bundle verification line) after every significant change — see `docs/CONVENTIONS.md` for the exact pattern already in use.
- Commit messages and in-repo documentation are in French (matches the user); code identifiers and comments in source files follow whatever that file already uses (mostly French comments explaining *why*, English identifiers).
- Push after each meaningful step — this user has asked for that explicitly and repeatedly.
