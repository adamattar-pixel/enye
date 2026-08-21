# Spec: Listening comprehension (Compréhension orale / Écoute tab)

Status: **captions pipeline confirmed working end-to-end on device (2026-08-21); video playback confirmed BROKEN the same day** — see `docs/AUDIT.md` Issues #1–#2. This spec describes the intended and mostly-built behavior; where reality diverges, it's called out explicitly.

## Problem

The user wants dictation-style practice against real spoken Spanish, not just static example sentences — hearing a native speaker, typing what was understood, and getting graded, the same spaced-repetition way vocabulary and conjugation already work.

## Goal

A sixth app tab ("Écoute") where the user builds a personal library of YouTube videos, and reviews auto-selected caption segments from them: play the segment, type what was heard, check against the real transcript, grade via SM-2.

## Requirements

- User adds videos by pasting a URL or searching by keyword (searches YouTube itself, not a curated catalog).
- The app auto-selects what to review next: a video, then a segment within it — never asks the user to pick.
- The same video must not repeat across the last `VIDEO_COOLDOWN` (3) exercises, *unless* too few eligible videos exist to honor that (see Selection algorithm below).
- Video selection must never be biased by how many due segments a video has — a 100-segment video and a 2-segment video must be equally likely to be picked, each time.
- The segment plays via YouTube's own player (no downloading/re-hosting video) — start/end times bound to the segment.
- Transcript is hidden until the user submits an answer.
- Answer comparison tolerates accents, punctuation, and case (reuses `mobile/src/validation/textAnswer.ts`, shared with conjugation) — but not truncation (a partial answer is still wrong).
- A video with no usable captions stays in the library (visible, marked non-exploitable), never selected for review — never a hard error, never blocks adding it.

## Constraints

- No backend/server of any kind (see `CLAUDE.md`) — everything runs from the Expo app itself, inside a `WebView` where a real browser engine is needed.
- No official YouTube API covers caption *content* retrieval for arbitrary third-party videos (`captions.download` requires OAuth from the video's owner) — every mechanism here is unofficial and can break without notice if YouTube changes its page/API structure.
- Must run in Expo Go, no dev build — `react-native-webview` is the only native dependency this feature added, confirmed to install/bundle cleanly. Its JS-execution and network-request capability is confirmed working on device (captions interception proves it); actual **video playback** was confirmed BROKEN on device (2026-08-21) with a synthetic-HTML + IFrame-JS-API player (undocumented error 152, reproduced on two different videos after ruling out origin and video-specific causes). Rebuilt to load a real `youtube.com/embed/{id}` URL instead (Decision 013) — **not yet reverified on device.** See `mobile/src/components/YouTubePlayer.tsx` and `docs/AUDIT.md` Issue #2.

## Selection algorithm (implemented, `mobile/src/listening/selection.ts` + `ListeningReviewContainer.tsx`)

```
1. dueSegments = getDueListeningCardsSplit(db, now, settings)   -- SQL, SM-2 "due" pool
2. dueVideoIds = distinct video_id among dueSegments
3. recentVideoIds = last VIDEO_COOLDOWN distinct video_id, most-recent-first
     (seeded from persisted listening_reviews at session start,
      updated in-memory as the session progresses -- NOT re-queried
      per exercise, because cooldown must reflect grades made
      earlier in *this* session too)
4. eligibleVideoIds = selectEligibleVideoIds(dueVideoIds, recentVideoIds, cooldown=3)
     -- relaxes the cooldown window (3 -> 2 -> 1 -> 0) until at least
        one video is eligible; never blocks
5. video = pickRandomVideo(eligibleVideoIds)   -- uniform among eligible video IDs
6. segment = pickRandomSegment(dueSegments filtered to that video)  -- uniform
```

Verified by unit test (`selection.test.ts`, 12/12): cooldown enforcement, the 1/2/3/4-eligible-videos relaxation edge cases, and a statistical no-bias-by-segment-count check.

## Captions pipeline (confirmed working end-to-end on device 2026-08-21)

```
Add video (URL or search result)
  -> fetchVideoMetadata()  [oEmbed, official, confirmed working]
  -> fetchVideoCaptions()  [captions.ts: raw HTTP fetch to timedtext]
       -- confirmed 100% broken from every network tested, including
          the user's real iPhone: returns HTTP 200 with an EMPTY body.
          Root cause: YouTube's PoToken/BotGuard anti-bot requirement,
          applied to any non-browser-issued request -- this path will
          likely never work and exists only as a free first attempt.
  -> if that returns 0 segments, fall back to useTranscriptFetcher()
     (TranscriptFetcher.tsx):
       1. patch window.fetch/XMLHttpRequest BEFORE page load
          (injectedJavaScriptBeforeContentLoaded) to intercept any
          request containing get_transcript or timedtext
       2. load the real watch page in a hidden WebView, desktop
          userAgent forced (NOT &app=desktop -- that serves YouTube's
          legacy pre-2017 page instead, confirmed on-device, fixed)
       3. after load + 2.5s, inject a script that dismisses a cookie-
          consent banner if present, then finds and clicks the real
          "Show transcript" button (so YouTube's own code issues the
          request, carrying a token it generates correctly)
          -- CONFIRMED WORKING on device 2026-08-21: button found and
             clicked (found: true, selector: "aria-label")
       4. if nothing is intercepted within 5s of the click, fall back
          to reading the rendered ytd-transcript-segment-renderer DOM
          directly (not yet exercised on device -- step 3 has been
          succeeding, so this fallback path hasn't fired in testing)
       5. 9s global timeout -> unavailable if nothing worked
  -> intercepted body parsed by mobile/src/listening/transcriptParsing.ts
     (extracted from TranscriptFetcher.tsx specifically so it's testable
     -- importing react-native-webview crashes under Jest):
       - CONFIRMED on device 2026-08-21: real requests intercepted
         across multiple videos (`timedtext?...&pot=...&potc=1&fmt=json3`,
         bodies from ~130KB to ~858KB) use the shape { events: [{
         tStartMs, dDurationMs, segs: [{ utf8 }] }] } -- parseJson3Captions()
         handles this, unit-tested (8 tests) AND confirmed producing a
         non-zero segment count in the app itself on a real device.
       - a speculative get_transcript-shaped fallback parser
         (extractJsonTranscriptSegments) is kept second-priority in
         case some request path returns that shape instead -- still
         unconfirmed, was never actually observed
  -> segments imported into SQLite (listening_videos/listening_segments/
     listening_cards), captionStatus = available | auto_generated | unavailable
     -- an earlier columnCount mismatch (5 vs. 6) in the listening_segments
        batch insert (database.ts) caused every add to fail with a SQLite
        error at this step; fixed, confirmed on device 2026-08-21
```

**Current status, from real device logs (2026-08-21):** the entire pipeline is confirmed working end-to-end — button found/clicked, real caption content intercepted across multiple videos (up to ~858KB, PoToken param proving the approach is sound), parsed by `parseJson3Captions`, written to SQLite, and the user explicitly confirmed the app shows a non-zero segment count for added videos. Not yet independently verified: that the transcript text itself reads as correct, natural Spanish rather than just non-empty (no reason to suspect otherwise, just not specifically checked).

## Edge cases (decided, see root `PLAN.md`'s original planning section for full reasoning)

| Case | Behavior |
|---|---|
| Captions unavailable at add-time | `captionStatus = 'unavailable'`, video kept in library, never selected for review |
| Video deleted/private/unavailable after being added | No proactive re-check; a failed load during a review attempt is local to that attempt, the card stays due |
| Network failure at any step | Try/catch, never crash; add-form shows an error, review screen shows a simple error with a way back |
| Auto-generated (ASR) vs. manual captions | Both accepted; `captionStatus` distinguishes them for the library UI, no automatic filtering |
| Too few videos to honor `VIDEO_COOLDOWN` | Progressive relaxation (see Selection algorithm) — never blocks |

## Interfaces

- `mobile/src/listening/types.ts` — `ListeningVideo`, `ListeningSegment`, `CaptionStatus`.
- `mobile/src/listening/{youtubeUrl,search,metadata,captions,selection}.ts` — pure/network helpers, see file headers for what's tested vs. live-verified vs. speculative.
- `mobile/src/listening/TranscriptFetcher.tsx` — the WebView-based fallback (orchestration only), see above.
- `mobile/src/listening/transcriptParsing.ts` — pure parsing of the intercepted caption body (json3/get_transcript/XML), unit-tested (`transcriptParsing.test.ts`). Kept separate from `TranscriptFetcher.tsx` because importing `react-native-webview` crashes at module load under Jest.
- `mobile/src/data/database.ts` — `listening_videos`/`listening_segments`/`listening_cards`/`listening_reviews` tables and their CRUD (no test coverage, see `docs/CONVENTIONS.md`).
- `mobile/src/data/settings.ts` — `listeningNewSegmentsPerDay`/`listeningReviewCapPerDay` (defaults 5/15, never tuned from real usage).

## Acceptance criteria

- [x] Adding a real Spanish-language YouTube video from the app produces `captionStatus !== 'unavailable'` and at least one segment — confirmed 2026-08-21 across multiple videos, user-reported non-zero segment counts in the app.
- [ ] At least one segment's transcript text is real, readable Spanish (not empty/garbled) — not empty is confirmed (real payloads up to ~858KB parsed), readability specifically not yet checked.
- [ ] A review session plays the video segment, accepts a typed answer, and grades it — implemented and not currently suspected broken, but not yet exercised end-to-end now that segments exist to review.
- [ ] The same video does not repeat within 3 consecutive exercises when ≥4 videos have due segments (already covered by unit tests; real end-to-end confirmation still pending — needs enough added videos with segments to actually test).

The captions-retrieval blocker (the main open risk) is resolved. Don't mark the whole feature "done" until a review session has actually been run on device.
