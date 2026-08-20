# Architecture

Describes the system as it actually exists in `mobile/`, not an aspirational design. Verified by reading the source (see file paths throughout) on 2026-08-20.

## Stack

Expo SDK 54, React Native 0.81.5, React 19.1.0, TypeScript (`strict: true`). No navigation library — a hand-rolled tab system. No state-management library — local component state + SQLite as source of truth. No lint script configured (only `tsc`/`jest`). No CI/CD.

## Top-level shape

```
App.tsx                          startup sequence: open DB → migrate → import/resync
  └─ RootTabs.tsx                 owns which screen/session is active
       ├─ TabBar.tsx              ☰ icon (top-right) + slide-in drawer, replaces old bottom bar
       ├─ 6 screens (tab content) each with internal sub-tabs where relevant
       └─ 3 review "session" containers (full-screen, hide the tab bar)
```

## Content domains

Three independent content types share the same SM-2 engine but differ in where content lives:

```
                    ┌─────────────────────────────────────────────┐
                    │              SM2Engine (pure)                │
                    │   mobile/src/sm2/{engine,types}.ts            │
                    │   review(card, grade, now) -> next card state │
                    └───────┬───────────────┬───────────────┬──────┘
                            │               │               │
                 ┌──────────▼───────┐ ┌─────▼──────────┐ ┌──▼─────────────────┐
                 │  Vocabulary        │ │  Conjugation    │ │  Listening          │
                 │  content: bundled  │ │  content: bundled│ │  content: NONE       │
                 │  words.json        │ │  conjugations.json│ │  bundled — user adds │
                 │  (~6002 words)     │ │  (1227 verbs ×52) │ │  videos at runtime    │
                 │  card key: word.id │ │  key: verb:tense: │ │  key: videoId:index   │
                 │                    │ │       person       │ │  (segment id)         │
                 └────────────────────┘ └────────────────────┘ └──────────────────────┘
```

- **Vocabulary & conjugation**: content generated offline by Node scripts (`mobile/scripts/generate-vocabulary/`, `generate-conjugations/`, `tag-themes/`) into static JSON, bundled with the app, imported into SQLite on first run (`importMissingWords`/`importMissingConjugationCards` — insert-only, never touch existing rows). `resyncWordTags` (added 2026-08-20) is the one exception: it re-syncs the `tags` column on existing rows when the bundle's tags change, because insert-only import silently stops propagating content updates once a word already exists on a device.
- **Listening**: no bundle. `listening_videos`/`listening_segments` are populated at runtime when the user pastes a URL or searches (`mobile/src/listening/search.ts`, unofficial `ytInitialData` scrape of `youtube.com/results`) and adds a video. Captions are fetched two ways in sequence — see `docs/specs/listening-comprehension.md`.

## Database (`mobile/src/data/database.ts`)

Single SQLite file (`expo-sqlite`), schema is additive-only (`CREATE TABLE IF NOT EXISTS` in `migrateDbIfNeeded`, no real migration system — a schema change means a new column added to an existing `CREATE TABLE IF NOT EXISTS`, which is silently a no-op for existing installs; renamed columns require a new `DB_NAME`, already done once for the Spanish→English pivot). Tables:

| Table | Purpose |
|---|---|
| `words` / `cards` / `reviews` | vocabulary content, SM-2 state, review log |
| `conjugation_cards` / `conjugation_reviews` | conjugation SM-2 state + log (content stays in `conjugations.json`, not duplicated in SQL) |
| `listening_videos` / `listening_segments` / `listening_cards` / `listening_reviews` | listening content (video/segment metadata + transcript text) AND SM-2 state — the only domain where content lives in SQL |
| `settings` | single-row JSON blob, see `mobile/src/data/settings.ts` |
| `scheduled_notifications` | mirror of what's actually scheduled with `expo-notifications`, written at schedule time so "next notification" can be *read* rather than recomputed |

**No SQLite in-memory test double exists under Jest/jest-expo** — `database.ts` has zero automated test coverage. Every function there has only been verified via `tsc` + manual reasoning, not execution, until a human confirms on-device.

## Navigation (`mobile/src/navigation/`)

`RootTabs.tsx` holds two pieces of state: `tab` (which of 6 screens is showing) and `activeSession` (`'none' | 'vocab' | 'conjugation' | 'listening'`) — a session is a full-screen flashcard flow that hides the tab bar entirely. `TabBar.tsx` is a ☰ icon (flat, no background — deliberately "same visual plane" as the rest of the screen) that opens a right-anchored slide-in drawer listing the 6 tabs; it only mounts when `activeSession === 'none'`.

## Screens and their review flows

Each of the three trainable domains follows the same pattern: `XScreen.tsx` (browse/manage, with sub-tabs) → `XReviewContainer.tsx` (loads next due card, persists grade, loop) → `XReviewScreen.tsx` (the actual flashcard UI). Copy-pasted per domain rather than abstracted — see `docs/DECISIONS.md` for why.

```
TodayScreen ─────────────► ReviewScreenContainer ──► ReviewScreen        (vocab)
ConjugationScreen ───────► ConjugationReviewContainer ──► ConjugationReviewScreen
ListeningScreen ─────────► ListeningReviewContainer ──► ListeningReviewScreen
StatsScreen (+ Historique sub-tab, moved here from Réglages 2026-08-20)
DecksScreen               (word list, filters by tag/level, add/delete user words)
SettingsScreen            (Réglages + Notifications sub-tabs)
```

Listening's selection differs from the other two: video is chosen first (uniform random among eligible, cooldown-respecting via `mobile/src/listening/selection.ts`), then a segment within that video — done client-side in `ListeningReviewContainer.tsx` on top of a due-segments pool from SQL, not inside a single query. See `docs/specs/listening-comprehension.md` for the exact algorithm.

## Notifications (`mobile/src/notifications/`)

Two-stage local notification (word alone → tap "Ver traducción" → second notification with translation + 4 grade buttons), driven by `mobile/src/scheduler/reviewScheduler.ts` (ported from the Swift `Packages/ReviewScheduler` package, same test suite). Vocabulary only — conjugation and listening are in-app-only by explicit decision (see `docs/DECISIONS.md`).

## Design system (`mobile/src/theme/`, `mobile/src/components/`)

"Sol y sombra" palette (light/dark), `useTheme()` hook. Shared primitives: `ScreenContainer` (centralized padding), `AnimatedPressable` (press feedback, built on RN's built-in `Animated`, not `react-native-reanimated` — see `docs/DECISIONS.md`), `FadeInView` (fade+slide entrance), `AzulejoFrieze` (decorative). No component library.
