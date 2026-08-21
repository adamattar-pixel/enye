# Decisions

Architecturally significant decisions only — not every bugfix. Full reasoning and evidence for each lives in the dated root `AUDIT.md`/`PLAN.md` entries; this file is the index of *what was decided and why*, so a future session doesn't reopen a settled question. Consult this before proposing an architecture change.

---

# Decision 001 — Expo/React Native instead of native iOS Swift

Date: 2026-08-20
Status: Accepted

Context: Development happens on Windows, no Mac available, no paid Apple developer account. Native iOS build (`Packages/SM2Engine`, `Packages/ReviewScheduler`, planned SwiftUI app) had 6 of 8 phases blocked for this reason.

Decision: Move active development to Expo/React Native (`mobile/`), testable directly on iPhone via Expo Go, no Mac/Xcode/dev account required.

Reasoning: Only path to actually running and testing the app given the hardware/account constraints.

Alternatives: Wait for Mac access (indefinite blocker); use a CI-based macOS builder (still needs a paid account for on-device testing beyond 7-day free provisioning).

Consequences: No Notification Content Extension possible → notifications can't have custom UI, only the two-stage native-button flow. `Packages/SM2Engine`/`Packages/ReviewScheduler` kept as the reference spec the TypeScript port was tested against, not deleted, not actively developed.

---

# Decision 002 — Spanish→English, not Spanish→French

Date: 2026-08-20
Status: Accepted

Context: Vocabulary source choice forced this — the best available frequency-ranked dataset ([doozan/spanish_data](https://github.com/doozan/spanish_data)) only provides English glosses.

Decision: Pivot the whole app's target language pair to Spanish→English, including the 36 hand-written words (retranslated directly from Spanish, not routed through French).

Consequences: `Word.french`/`example_fr` renamed to `english`/`example_en` throughout; `DB_NAME` changed (`lexis.db` → `lexis-en.db`) to force a fresh DB rather than migrate a schema that no longer matches.

---

# Decision 003 — One generic SM-2 engine shared by all three content domains

Date: 2026-08-20 (conjugation), 2026-08-20 (listening)
Status: Accepted

Context: Vocabulary already had a pure `review(card, grade, now)` engine (`mobile/src/sm2/`, ported from Swift). Conjugation and later listening needed spaced repetition too.

Decision: Reuse the engine unmodified for all three; only the card-id scheme differs (`word.id`, `` `${verbId}:${tense}:${person}` ``, `` `${videoId}:${index}` ``).

Reasoning: The engine is content-agnostic by construction — no reason to fork it.

Alternatives: A separate engine/config per domain — rejected, no actual behavioral need for one.

---

# Decision 004 — `@v4nn4/ablaut` instead of `spanish-verbs` for conjugation generation

Date: 2026-08-20
Status: Accepted

Context: `spanish-verbs` (npm) was the original plan for generating `conjugations.json`.

Decision: Switched to `@v4nn4/ablaut` (WASM rule engine) after testing both.

Reasoning: `spanish-verbs` measured at ~43% error rate on stem-changing verbs in present subjunctive during a live test (including cross-contamination between verbs — `hacer` returning `tener` forms), and is deprecated. `@v4nn4/ablaut` is independently verified at 100.00% on 339,200 Spanish forms and retested clean here.

Alternatives: Hand-correct `spanish-verbs` output — rejected, error rate too high and not systematically fixable without re-deriving conjugation rules.

---

# Decision 005 — `react-native-reanimated` removed entirely

Date: 2026-08-20
Status: Accepted

Context: Grading buttons didn't respond to touch and animations weren't visible. Root cause eventually found to be a separate layout bug (`AnimatedPressable` applying `style` to an inner `Animated.View` instead of the outer `Pressable`), but Reanimated/New-Architecture interaction was a live suspect at the time.

Decision: Remove `react-native-reanimated`/`react-native-worklets` entirely, rebuild all animation (`AnimatedPressable`, `FadeInView`, progress bars) on React Native's own built-in `Animated` API.

Reasoning: `Animated` has no native-module dependency, so it can't suffer the same class of Expo-Go incompatibility, regardless of whether Reanimated was actually the cause of the original bug.

Consequences: Every new animation in this app (including the tab drawer's slide-in) must use `Animated`, not Reanimated — there is no Reanimated dependency to reach for even if it seems convenient.

---

# Decision 006 — Conjugation and Listening are in-app only, never in notifications

Date: 2026-08-20 (conjugation), confirmed again same day for listening
Status: Accepted

Context: Vocabulary review can be triggered from lock-screen notifications. Conjugation and listening could theoretically do the same.

Decision: Explicitly out of scope, confirmed by the user more than once. Notifications remain vocabulary-only.

Consequences: Don't re-propose this without an explicit new request — it's been declined twice.

---

# Decision 007 — Per-domain screen/container/review-screen files, not a shared abstraction

Date: 2026-08-20
Status: Accepted

Context: Vocabulary, conjugation, and listening each need a browse screen, a session container, and a flashcard UI — structurally identical shape three times.

Decision: Copy the pattern per domain (`ConjugationScreen.tsx` etc. duplicate `TodayScreen`/`ReviewScreenContainer`'s structure rather than sharing a generic component) rather than building a shared generic review-flow abstraction.

Reasoning: The three domains differ enough in their card data shape and prompt UI (typed answer vs. flashcard reveal vs. video player) that a shared abstraction would need significant configuration surface for three call sites — not judged worth it at this scale.

Consequences: A UI fix to the review flow (e.g. the keyboard-dismiss-on-tap-outside fix) must be applied to each `*ReviewScreen.tsx` file individually — there is no shared base to fix once.

---

# Decision 008 — Listening feature is the one exception to "fully offline"

Date: 2026-08-20
Status: Accepted

Context: The listening feature's entire premise — real people talking in YouTube videos — requires network access to load the YouTube player and fetch captions.

Decision: Accept network dependency for this one tab only; rest of the app stays fully offline.

Consequences: No offline fallback for listening; captions/metadata fetches must degrade silently (mark unavailable, never crash) rather than block the feature.

---

# Decision 009 — Video-then-segment two-tier random selection for listening

Date: 2026-08-20
Status: Accepted

Context: Explicit requirement: never repeat the same video across the last `VIDEO_COOLDOWN` (3) exercises, and never let a video with more segments be more likely to be picked.

Decision: Select uniformly among *eligible videos* first (`mobile/src/listening/selection.ts`), then uniformly among that video's due segments — not a single flat random pick across all due segments.

Reasoning: A flat pick across segments would structurally bias toward videos with more segments; picking the video first, from the set of distinct eligible video ids, makes segment count irrelevant to selection probability.

Consequences: Selection logic lives client-side in `ListeningReviewContainer.tsx` (not a single SQL query) because the cooldown must account for exercises graded *during* the current session, not just what's already persisted.

---

# Decision 010 — Listening captions: WebView-based fetch, not raw HTTP

Date: 2026-08-20 (multiple iterations), confirmed working end-to-end on device 2026-08-21
Status: Accepted, confirmed working end-to-end on a real device

Context: Direct HTTP fetch to YouTube's `timedtext`/InnerTube endpoints fails 100% of the time from every network tested (datacenter and — per on-device logs — from the user's iPhone too), most likely YouTube's PoToken/BotGuard anti-bot requirement.

Decision: Load the real `youtube.com/watch` page in a hidden `WebView`, intercept the request the page's *own* code makes when the user clicks "Show transcript" (patched `fetch`/`XMLHttpRequest` before page load), with a DOM-read fallback. See `docs/specs/listening-comprehension.md` for the full mechanism.

Alternatives considered and rejected: issuing our own `fetch()` from inside the WebView's JS context (tried first, no better — a self-issued request doesn't inherit a valid PoToken just by running in a browser engine); a small local backend proxy (documented as a fallback, not built — no evidence it's necessary, and now less likely to be needed).

Status detail: confirmed working end-to-end on device 2026-08-21 — the button is found and clicked, real caption payloads (up to ~858KB, `fmt=json3` shape) were intercepted across multiple videos with a `pot`/`potc` PoToken param in the URL (direct confirmation of the whole hypothesis), the `fmt=json3` parser (`mobile/src/listening/transcriptParsing.ts`) correctly produces segments, and — after fixing an unrelated `insertInBatches` column-count mismatch in the DB write (`mobile/src/data/database.ts`) — the user confirmed the app itself shows a non-zero segment count for added videos, not just the logs. The local-backend-proxy fallback is not needed; this mechanism is the final, working implementation.

---

# Decision 011 — SQLite schema is additive-only, no migration system

Date: established 2026-08-20 (Spanish→English pivot), reaffirmed for every subsequent table added
Status: Accepted

Context: `migrateDbIfNeeded` uses `CREATE TABLE IF NOT EXISTS` for every table, no version tracking.

Decision: Schema changes must be additive (new tables, or — accepted so far — silently-ignored new columns on existing `CREATE TABLE IF NOT EXISTS` statements don't actually alter existing installs). A genuinely breaking change (column rename/removal) requires a new `DB_NAME` to force a fresh database, losing existing local progress.

Reasoning: No real migration system was built (assessed as disproportionate for a single-user local app); accepted the tradeoff explicitly once already (Spanish→English pivot) with "no real user data lost yet, nothing has run end-to-end on device" as the justification at the time — that justification will not hold once the app has real on-device usage history.

Consequences: **Revisit this decision before shipping a breaking schema change once the app has real user progress worth preserving** — a silent data-loss migration is not acceptable at that point.

---

# Decision 012 — Word/conjugation tags: keyword heuristic + explicit catch-all, not real NLP

Date: 2026-08-20
Status: Accepted

Context: Needed every one of ~6002 generated vocabulary words to carry at least one theme tag; no semantic-understanding tool available in this workflow.

Decision: Keyword matching on the English gloss against curated per-theme word lists, plus direct part-of-speech tagging for pure grammar words (prepositions etc. → "grammaire"), plus a `"divers"` catch-all tag for anything that still matches nothing.

Reasoning: Literal 100% coverage was requested; a keyword heuristic cannot achieve full *semantic* accuracy, so the catch-all is the honest way to guarantee coverage without pretending the tagging is more meaningful than it is.

Consequences: ~3100 of 6002 words carry a tag only via the `"divers"` catch-all — not a real theme. Don't present tag coverage as semantically complete; it's a documented limitation, not a resolved gap.

---

# Decision 013 — YouTube video player: real `embed/{id}` URL, not a synthetic HTML page with the IFrame JS API

Date: 2026-08-21
Status: Superseded by Decision 014 (2026-08-21, same day) — the real-embed-URL approach still failed on device (confirmed even on a universal reference video), and the homegrown player was abandoned entirely in favor of a library. Kept here because the reasoning about synthetic-origin pages remains correct and directly informed Decision 014.

Context: `mobile/src/components/YouTubePlayer.tsx` originally loaded a custom HTML document (`source={{ html: ... }}`) embedding YouTube's official IFrame Player API (`YT.Player`) via a `<script>` tag, to get precise `onReady`/`onStateChange`/`onError` JS events. Confirmed broken on device 2026-08-21 with an undocumented error code 152 on every video tested. Two targeted fixes (`baseUrl` on the WebView source, `origin` in `playerVars` — both documented, standard remedies for exactly this class of failure) were applied and both individually confirmed *not* the cause via device logs (origin was provably correct, error persisted identically). A "maybe it's just this one video" hypothesis was also tested and ruled out — a second, unrelated video produced the identical error.

Decision: Replace the synthetic-HTML + IFrame-JS-API approach entirely. `YouTubePlayer` now loads a real `https://www.youtube.com/embed/{videoId}` URL directly (`source.uri`), with `start`/`end`/`autoplay`/`playsinline`/`controls` as URL query params (all natively supported by the embed endpoint, no JS API needed for segment bounding).

Reasoning: With the origin and video-specific hypotheses both eliminated by direct evidence, the remaining plausible cause is the fundamental approach — a WebView-hosted synthetic document trying to convince YouTube's IFrame API it has a legitimate origin, rather than actually being one. Loading YouTube's own real embed page by a real HTTPS URL sidesteps the whole class of problem, and mirrors `TranscriptFetcher.tsx`'s already-confirmed-working pattern of loading a real `youtube.com` page rather than fabricating one.

Alternatives considered and rejected: continuing to patch the synthetic-HTML approach with further playerVars/config tweaks — rejected once two independent, well-documented candidate fixes both failed to change the outcome, since further tweaks in that direction would be unguided guessing rather than evidence-driven.

Consequences: Precise JS player events (`onReady`, `onStateChange`) are no longer available without re-introducing the same origin problem via an injected IFrame-API script. `onReady`/`onError` are now inferred from a best-effort, multilingual text scan of the page 1.8s after load (not guaranteed exhaustive); `onSegmentEnded` is estimated by an RN-side timer (`endTime - startTime`), not a native event. Currently low-risk: `ListeningReviewScreen.tsx` only wires up `onError`, not the other two callbacks. If a future feature needs precise playback state, revisit this trade-off rather than silently degrading behavior.

---

# Decision 014 — YouTube video player: `react-native-youtube-iframe` library, not a homegrown WebView player

Date: 2026-08-21
Status: Accepted

Context: The homegrown player (Decision 013 and its predecessor) failed across 18 fix iterations, including on the real `/embed/{id}` URL with every plausible config fix applied (`baseUrl`, `origin`, `Referer`, desktop `userAgent`) — confirmed failing even on `dQw4w9WgXcQ` (Rick Astley/Sony Music's official upload), the standard universal-embeddability reference video used industry-wide, ruling out both origin and video-specific explanations. The user then asked directly for a library search ("cherche un api qui resoud tout") instead of continuing to patch a homegrown implementation.

Decision: Replace `mobile/src/components/YouTubePlayer.tsx`'s homegrown implementation with a thin wrapper around `react-native-youtube-iframe` (LonelyCpp), using its `initialPlayerParams.start`/`end` for segment bounding, `onReady`/`onChangeState`/`onError` callbacks, and `ref.seekTo()` for replay.

Reasoning: The library is pure JS/WebView (its only runtime dependency is a JS `events` polyfill; `react-native-webview` is an already-satisfied peer dependency) — no native linking, so it doesn't violate the Expo-Go-only constraint (`CLAUDE.md`), confirmed via `expo-doctor` (18/18) after install. Verified via its GitHub source (`iframe.html`) that it uses the *same* fundamental technique the homegrown player used (a page embedding YouTube's official `YT.Player` JS API) — the meaningful difference is that it serves that page from a real third-party HTTPS URL by default (`baseUrlOverride`, defaults to a GitHub Pages URL) rather than a synthetic HTML string with no genuine origin. Given every homegrown fix targeting "give the synthetic page a believable origin" failed, and this library (used by thousands of apps) succeeds using a *genuinely real* origin instead of a spoofed one, this is a well-justified explanation for the difference, not a coincidence.

Alternatives considered and rejected: continuing to patch the homegrown implementation — rejected given the sheer number of already-eliminated hypotheses (18 iterations) without success, and the user's explicit request to look for an existing solution rather than keep hand-rolling one. `react-native-youtube` (native module, requires linking/dev client) — rejected outright, violates the Expo-Go-only constraint before even evaluating it further.

Consequences: `YouTubePlayer.tsx`'s public interface (`videoId`/`startTime`/`endTime`/`onReady`/`onSegmentEnded`/`onError`/`replay()` via ref) is unchanged, so `ListeningReviewScreen.tsx` needed no changes. The `Linking.openURL` fallback added just before this swap (opens the real video at the correct start time when playback fails) is kept regardless of whether this library resolves the underlying issue, since it satisfies the user's actual stated requirement (bounded-start playback via *some* mechanism) independent of embedded-playback working at all.
