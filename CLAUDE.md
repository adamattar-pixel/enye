# CLAUDE.md

Entry point for Claude Code sessions on this repo. Keep this file short — details live in `docs/`.

## Project

**Lexis** — a Spanish→English vocabulary/grammar learning app on the Anki/SM-2 model. French user, French-language docs and commit messages throughout. Originally meant to be driven mostly from lock-screen notifications; as of the desktop migration (2026-09-04, see `docs/DECISIONS.md` Decision 016) that's no longer the model — see below.

## Active stack

**`mobile/`** (Expo/React Native/TypeScript, packaged with Electron) is the actively developed app, targeting **Windows desktop, not iOS**. It started as native iOS (Swift/SwiftUI/SwiftData, see `Packages/`), pivoted to Expo/Expo Go because development happens on Windows without a Mac or paid Apple developer account, then pivoted again (2026-09-04) to a Windows desktop build (Electron wrapping an Expo Web export) because a permanent iOS install has no free path either way (no Mac, no $99/year account) — see Decision 016 for the full reasoning. **iOS/Expo Go is abandoned, not kept in parallel.** The native Swift packages (`Packages/SM2Engine`, `Packages/ReviewScheduler`) are still not deleted — they're the reference spec the TypeScript port was tested against — but they are not where you add features.

**Do not work in `Packages/` unless explicitly asked.** All active work is in `mobile/`.

`mobile/AGENTS.md` (auto-loaded via `mobile/CLAUDE.md` when working inside `mobile/`) carries one standing rule worth knowing about even from the repo root: check the versioned Expo docs before writing Expo-API code, because the SDK has changed from under this project before.

## Essential commands

Run from `mobile/`:
```
npm run desktop              # dev: Metro web dev server + Electron together
npx jest --watchAll=false    # run tests once (npm test = watch mode)
npx tsc --noEmit             # type-check the app (excludes electron/)
npx tsc -p electron/tsconfig.json   # type-check the Electron main process separately
npm run desktop:package      # build a real Windows installer (release/)
```
There is no CI/CD configured — these are the only automated verification available. There is no lint script configured either. Both `tsc` targets must stay green — the app and the Electron main process are two separate TypeScript projects (see `electron/tsconfig.json`, Node/CommonJS output, excluded from the app's own `tsconfig.json`).

## Critical constraints

- **No native npm dependency requiring compilation** (the equivalent of the old "no `eas build`/Xcode" rule, carried into the desktop context) — `node:sqlite` was chosen specifically because it's a Node built-in, not an npm package, avoiding `electron-rebuild`/a C++ toolchain. If a task seems to need a compiled native module, stop and flag it before writing code.
- **The renderer (React/Expo Web code under `src/`) has no Node/Electron access directly** — `contextIsolation: true`, `nodeIntegration: false` on the main window. Anything needing Node/network-without-CORS/filesystem access goes through `electron/main.ts` + `electron/preload.ts`'s `contextBridge`, called via `window.lexisDesktop.*` from the renderer (see `src/data/ipcDb.ts`, `src/services/translateIpc.ts`, `src/services/bookImportIpc.ts` for the existing pattern — mirror it for anything new).
- Local OS notifications are gone (`expo-notifications` had no web/Electron support) — the due-card reminder is now an in-app check (Aujourd'hui tab, and Réglages → Rappel), not a push.
- The listening (Compréhension Orale) feature's YouTube-scraping technique (captions interception, `electron/captionsFetcher.ts`) now runs in the Electron main process (a hidden `BrowserWindow` with `contextIsolation: false`, since the technique requires patching `fetch`/`XMLHttpRequest` in the same JS world the real page's scripts run in) — not in the renderer, not via `react-native-webview` (removed, no working react-native-web equivalent exists for this specific technique; a plain browser's same-origin policy blocks it in principle, regardless of library).
- No test coverage exists for `mobile/src/data/database.ts` or anything touching SQLite directly — no in-memory test double available under Jest for `node:sqlite` either. Verify DB-touching changes manually by running the app; don't claim they're tested.
- **Visual verification is now possible without the user** (discovered 2026-09-13, corrects earlier guidance) — launch the real app (compiled `electron-dist/electron/main.js`, `app.setPath('userData', <isolated temp dir>)` set *before* requiring it so real user data is never touched) as a standalone script, drive it via `webContents.executeJavaScript` (click by matching text/aria-label, `element.click()` directly — NOT a manual walk up to an ancestor, since click events bubble upward through whichever ancestor React actually attached the handler to, and clicking a higher ancestor manually only bubbles further up, never back down to a lower one), and capture real pixels via `webContents.capturePage()` (or `webContents.debugger` + `Page.captureScreenshot`) saved to a PNG and viewed with the Read tool. A native `window.confirm`/`alert` dialog blocks the page's JS thread — handle it via the same debugger API (`Page.enable`, listen for `Page.javascriptDialogOpening`, reply with `Page.handleJavaScriptDialog`). Still genuinely unconfirmed without this: anything timing/animation-feel-dependent, audio, or requiring a real Google/YouTube account.

## Architecture, in one paragraph

SQLite (`node:sqlite`, in the Electron main process — see `electron/nodeSqliteAdapter.ts`) is the single source of truth for content + progress for vocabulary and conjugation (words/verbs bundled as JSON, imported on first run and incrementally topped up on updates, now done once at app boot in the main process rather than the renderer); the listening feature has no bundled content — users add videos at runtime, so SQLite holds everything for it. The renderer never talks to SQLite directly — it goes through an IPC bridge (`src/data/ipcDb.ts` implementing the `LexisDb` interface from `src/data/dbTypes.ts`) that every function in `src/data/database.ts` was already written against, so none of that business logic changed when the backend did. A single generic SM-2 engine (`mobile/src/sm2/`) grades all content types via different card-id schemes. Six screens live behind a hamburger-drawer nav (`mobile/src/navigation/`), each internally split into sub-tabs where relevant (Réglages, Conjugaison, Écoute, Statistiques). See `docs/ARCHITECTURE.md` for the real breakdown (not yet updated for the desktop migration as of this writing — cross-check against `docs/DECISIONS.md` Decision 016 and `docs/AUDIT.md` if it looks stale).

## Where to look

| Need | File |
|---|---|
| How the system is actually built | `docs/ARCHITECTURE.md` |
| Why a technical choice was made | `docs/DECISIONS.md` |
| What's being worked on right now | `docs/PLAN.md`, `docs/TODO.md` |
| Current known issues / unverified claims | `docs/AUDIT.md` |
| Code style, naming, testing conventions | `docs/CONVENTIONS.md` |
| Full requirements for a specific feature | `docs/specs/` |

## Working rules for this repo

- **Confirm real bugs with a live test before fixing them**, and confirm fixes worked before calling them done — this project has a strong pattern (established across many sessions) of live-testing hypotheses (via `curl`/Node scripts for network behavior, asking the user to test on-device for anything UI/WebView-related) rather than guessing. Never write "fixed" or "resolved" for anything not actually confirmed working.
- **Ask when genuinely ambiguous** rather than guessing on UI/UX requests — this user has repeatedly preferred a clarifying question (with concrete options/mockups) over a wrong guess.
- Update `docs/PLAN.md` and `docs/AUDIT.md` (current-state snapshots, not changelogs — overwrite stale entries rather than appending history) after every significant change, with a `tsc`/`jest`/bundle verification line — see `docs/CONVENTIONS.md` for the exact pattern already in use.
- Commit messages and in-repo documentation are in French (matches the user); code identifiers and comments in source files follow whatever that file already uses (mostly French comments explaining *why*, English identifiers).
- Push after each meaningful step — this user has asked for that explicitly and repeatedly.
