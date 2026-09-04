# Decisions

Architecturally significant decisions only — not every bugfix. Full reasoning and evidence for each is summarized in `docs/AUDIT.md`/`docs/PLAN.md`; this file is the index of *what was decided and why*, so a future session doesn't reopen a settled question. Consult this before proposing an architecture change.

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

---

# Decision 015 — Livres: no PDF support, EPUB via `jszip`, translation via a personal DeepL key

Date: 2026-08-21
Status: Accepted

Context: The user requested a "Livres" free-reading feature (no SM-2 progress) supporting EPUB/TXT/HTML/PDF import plus tap-a-sentence-to-translate. Two parts of the request conflicted with established project constraints and were raised back to the user (via `AskUserQuestion`) before writing any code, rather than guessed past: (1) reliable in-browser-free PDF text extraction has no pure-JS solution — the realistic options are a native module (violates `CLAUDE.md`'s Expo-Go-only constraint) or a DOM/canvas-oriented library like `pdf.js` (not straightforwardly usable in Expo Go). (2) The request assumed an existing "API key" pattern in this codebase to reuse for a translation API — none exists; every prior external-data feature (YouTube search, captions) deliberately avoids official APIs/keys specifically because there is no backend to hold a real secret, and any key baked into a distributed Expo app bundle is extractable by anyone who downloads the app.

Decision: (1) No PDF support in v1 — EPUB/TXT/HTML only; revisit if a genuinely Expo-Go-compatible PDF text extraction approach is found later. (2) EPUB parsing via `jszip` (pure JS zip/inflate, confirmed no native dependencies via its own `package.json` before adding — same verification standard as Decision 014) plus hand-written OPF/container XML parsing (`mobile/src/books/parsing.ts`, unit-tested) using the spine (not the optional nav/NCX table of contents) as the sole source of chapter order. (3) Translation via DeepL's Free-tier REST API (`api-free.deepl.com`, distinct from the paid-only `api.deepl.com`), called with a personal API key the user provides via `EXPO_PUBLIC_DEEPL_API_KEY` (`.env`, gitignored; `.env.example` documents the variable with no real value) — accepting that this key is not truly secret once bundled into the app, a risk the user explicitly chose to accept given the app is for personal use only, not wider distribution.

Reasoning: PDF's absence and the translation key's insecurity are both real, unavoidable constraints of this project's architecture (offline-only, no backend, Expo Go only) — surfacing them as an explicit choice was safer than silently shipping a broken PDF "support" claim or an insecure pattern the user hadn't actually agreed to. `jszip` is the standard, well-established pure-JS unzip library (used across thousands of RN/web projects for exactly this EPUB-parsing use case); hand-writing DEFLATE decompression instead would be unreasonable engineering effort for no benefit, unlike genuinely hand-rollable regex-based XML/HTML parsing (which the project already biases toward, see `docs/CONVENTIONS.md`).

Alternatives considered and rejected: a dev-build/native module for PDF — rejected, breaks the single most emphasized constraint in this codebase for one file format. Google Translate's official API — rejected in favor of DeepL, which has a genuinely usable free tier (500k characters/month); Google's Cloud Translation API is effectively paid-only for real usage. Scraping a translation website (matching the YouTube-search precedent of avoiding official APIs) — not pursued for v1 given DeepL's free tier removes the need to take on that fragility for this specific feature; could be revisited if the DeepL key proves inconvenient to maintain.

Consequences: Book search results (Open Library + Internet Archive `_djvu.txt` OCR text) are lower-quality "best effort" content, same honest framing as the vocabulary/expressions/reading generation scripts' documented limitations — not proper EPUBs, since fetching a verified-available EPUB from IA's metadata would need extra round-trips not implemented in v1. Anyone who wants live translation must independently obtain and configure their own DeepL key; the feature degrades to "no translation" (a clear in-app message, not a crash) when unconfigured, via `services/translate.ts#isTranslationAvailable()`.

# Decision 016 — Desktop target: Expo Web packaged in Electron (Windows only), iOS abandoned

Date: 2026-09-04
Status: Accepted (Phase 0 — architecture only, no code written yet)

Context: No Mac and no paid Apple Developer account means no free path to a permanent, icon-on-home-screen iOS install (Xcode local signing needs a Mac and expires every 7 days; the $99/year program is the only alternative — see the conversation immediately preceding this decision). The user asked to retarget the app entirely to a local Windows desktop install instead, with four points settled by explicit question before any target was chosen: Windows only (no Mac/Linux to test against); the PC target **replaces** iOS rather than running alongside it; progress starts fresh on PC rather than migrating the phone's SQLite file; and scheduled OS reminders are replaced by an in-app "cartes dues" check shown at launch, not ported.

Before recommending a target, each of the six risk areas the user asked about was checked against the actually-installed versions and current library docs (not memory):

- **`expo-sqlite` (`~16.0.10`) on web**: web support exists but is explicitly labeled alpha ("may be unstable") by Expo's own docs, backed by a WASM build that needs Metro configured for `.wasm` assets plus `Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` response headers (for `SharedArrayBuffer`) — not something a plain static file server provides without extra setup. Persistence across reload is confirmed working (backed by OPFS). Irrelevant for the Electron target: Electron's main process is a real Node runtime, so a native SQLite driver (e.g. `better-sqlite3`) can be used directly — same SQL, no alpha-status WASM layer, no COOP/COEP header dance.
- **`expo-notifications` (`~0.32.17`)**: Expo's docs list its supported platforms as Android/iOS only — no web implementation exists at all. Moot here since the user chose to replace scheduled reminders with an in-app check rather than port them; the existing `mobile/src/notifications/` queue/scheduler code becomes dead weight to delete, not to adapt.
- **`react-native-webview` (`13.15.0`) and the listening-captions mechanism (Decision 010)**: confirmed no official react-native-web build exists; the community shim that does (`@react.native.web/webview`) is essentially unmaintained (last published years ago). But the deeper problem isn't library availability — it's the browser security model. Decision 010's technique depends on injecting a network-patch script into the *cross-origin* `youtube.com/watch` page and reading the network requests that page makes, before the page runs. A regular browser tab enforces the same-origin policy on cross-origin iframe content: script injection and network inspection into someone else's origin are exactly what that policy exists to block, and no react-native-web shim changes that, because it isn't a React Native limitation — it's what "browser" means. Electron's `webContents`/`<webview>` are different: Electron's main (Node) process has privileged access to a real embedded Chromium instance regardless of what origin it's displaying, via `session.webRequest` (request/response interception) and `webContents.executeJavaScript()` (arbitrary script injection) — the same two primitives Decision 010's `NETWORK_PATCH_SCRIPT`/`CLICK_SCRIPT`/`DOM_FALLBACK_SCRIPT` already use, just reached through Electron's APIs instead of `react-native-webview`'s. The injected scripts themselves and all of `transcriptParsing.ts` (pure TS, no RN import) port essentially unchanged; only the host component and the postMessage transport are rewritten.
- **`react-native-youtube-iframe` (video playback, Decision 014)**: also a WebView wrapper, same underlying constraint. On desktop this is actually a simplification rather than a loss: a plain `youtube.com/embed/{id}` iframe plus the official public YouTube IFrame Player API works directly in any browser or Electron renderer with no wrapper library needed — the existing millisecond-precise `seekTo`/`getCurrentTime` segment logic and the CC-disable DOM-click both reuse the same JS APIs, just called from a normal `<iframe>` instead of through the mobile library.
- **DeepL calls (`services/translate.ts`)**: confirmed via DeepL's own docs and community reports — direct browser `fetch` calls to `api-free.deepl.com` are blocked with a CORS 403, because DeepL deliberately doesn't allow credentialed calls from front-end code (key-exposure risk). A plain-browser target has no server to route around this. Electron's main process, being Node rather than a browser tab, is not subject to CORS at all — routing the DeepL call through the main process (via IPC from the renderer) removes the problem entirely, still 100% local with no real backend added.
- **EPUB import (`services/bookImport.ts`) and `jszip`**: `expo-file-system` has no documented web platform support, so the mobile pick-a-file flow needs a desktop equivalent — Electron's native `dialog.showOpenDialog` plus Node's `fs`, both straightforward. `jszip` itself was originally a browser library before it was a React Native one, so it and its `pako`/`readable-stream`/`lie` dependency chain are expected to bundle cleanly for a web/Electron target (not yet execution-tested there, only reasoned from its own design target). `books/parsing.ts` (pure regex/string XML handling, no RN import) is expected to port unchanged.

Three targets were compared, not on "modern-ness" but on how much of the above six items stay "adapt" rather than become "rewrite from scratch," given `mobile/package.json` has no `react-dom`/`react-native-web` installed yet (Expo CLI auto-installs both the first time `expo start --web`/`expo export --platform web` runs, so this isn't a blocker, just not truly zero-setup):

1. **Expo Web alone, opened in a local browser** — cheapest to try, but two of the six items (YouTube captions, DeepL) are not just harder here, they are architecturally impossible in a plain browser tab without standing up a real server, which directly contradicts this project's "no backend of any kind" constraint (`CLAUDE.md`). Rejected as the final target for that reason, though it remains a fast first smoke test of what the pure-UI code (SM-2 screens, Decks & mots, Historique/Stats) does under react-native-web before any Electron work starts.
2. **Expo Web + Electron** — Electron bundles its own Chromium and a full Node runtime in one local app, so both of the "impossible in a browser" items above become straightforward: `session.webRequest`/`executeJavaScript` for captions (the same two primitives Decision 010 already relies on), and a Node-context `fetch` for DeepL (CORS doesn't apply outside a browser tab). SQLite gets *more* robust than on the phone (a real native driver, not WASM). Notifications, while unused per the user's answer, would also have had a real native OS API available if kept. **Chosen.**
3. **Expo Web + Tauri** — same conceptual capability (an embedded webview a privileged host process can reach into), but Tauri uses each OS's *native* webview (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS) rather than one bundled Chromium, so the network-interception/script-injection code would need separate, less-uniform implementations per OS instead of Electron's single `webContents` API — and Tauri's backend is Rust, a genuinely new language for this project rather than an extension of the TypeScript already in use everywhere else in `mobile/`. Smaller install size and better resource usage are real Tauri advantages, but the user asked to optimize for "preserves the most functionality for the least rewriting," not footprint, and this project's single hardest problem (the YouTube scraping technique) is specifically the one place Tauri's fragmentation hurts most. Rejected.

Decision: Package Expo Web output in **Electron**, targeting **Windows only**. The **iOS/Expo Go target is abandoned**, not kept in parallel — `mobile/` stays the one codebase (per the user's explicit "reuse `src/data`/`src/scheduler`/`src/books`, don't fork"), but its shipped target becomes the Windows desktop build; `mobile/AGENTS.md`'s "check versioned Expo docs" rule and `CLAUDE.md`'s Expo-Go-only framing will need a follow-up documentation pass once implementation actually starts (not done in this phase, since no code has been written yet). SQLite progress starts fresh on PC — no phone-DB migration. `mobile/src/notifications/` (queue, scheduler wiring, categories) is deleted rather than ported; due cards are surfaced via an in-app check at launch instead.

Reasoning: every one of the two genuinely hard problems in this codebase — the PoToken-authenticated YouTube captions interception (Decision 010) and DeepL's CORS wall — has a real solution under Electron that reuses the existing technique's actual primitives (network interception + script injection into a privileged embedded browser), not a from-scratch replacement. That is a materially different, cheaper migration than either alternative, which is what the user asked to optimize for.

Alternatives considered and rejected: Expo Web alone — rejected, see above (two features architecturally impossible without a server). Tauri — rejected, see above (per-OS webview fragmentation on this project's hardest feature, plus a new language). A React Native macOS/Windows target (`react-native-windows`) was not seriously evaluated: it would require Microsoft's own native tooling/Visual Studio toolchain rather than reusing the Expo Web bundle, a much larger new-platform investment for a Windows-only, personal-use app than wrapping the existing Expo Web output.

Consequences: `electron` becomes a new (non-native, dev-tooling-only) dependency, justified above. The captions/video-playback/DeepL/file-import code paths are rewritten (not merely adapted) at the component level even though their underlying technique and most of their logic (injected scripts, parsing modules) carry over; this is real, non-trivial work, not a thin shim. `mobile/src/notifications/` becomes dead code to remove. iOS stops being a target going forward — Decision 001's original reason for choosing Expo/RN (no Mac, no paid dev account) no longer needs solving at all once the desktop target exists, but it also means the phone app this project has been building all along stops being what ships. `expo-sqlite`, `react-native-webview`, and `react-native-youtube-iframe` stop being used at all in the shipped app once this migration completes (their code stays in git history/Decision 010/014 as the reference the desktop mechanism was ported from, same spirit as `Packages/` being kept as reference after the Swift→Expo pivot). None of the above has been executed yet — this decision records the investigation and the chosen target only; see `docs/PLAN.md` for the phased implementation plan, not started.
