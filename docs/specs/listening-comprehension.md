# Spec: Listening comprehension (Compréhension orale / Écoute tab)

Status: **implemented, not yet working end-to-end** — see `docs/AUDIT.md` Issues #1. This spec describes the intended and mostly-built behavior; where reality diverges, it's called out explicitly.

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
- Must run in Expo Go, no dev build — `react-native-webview` is the only native dependency this feature added, confirmed to install/bundle cleanly, **never confirmed to actually render/play on the user's device**.

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

## Captions pipeline (the part that's currently broken)

```
Add video (URL or search result)
  -> fetchVideoMetadata()  [oEmbed, official, confirmed working]
  -> fetchVideoCaptions()  [captions.ts: raw HTTP fetch to timedtext]
       -- confirmed 100% broken from every network tested, including
          the user's real iPhone: returns HTTP 200 with an EMPTY body.
          Root cause hypothesis: YouTube's PoToken/BotGuard anti-bot
          requirement, applied to any non-browser-issued request.
  -> if that returns 0 segments, fall back to useTranscriptFetcher()
     (TranscriptFetcher.tsx):
       1. patch window.fetch/XMLHttpRequest BEFORE page load
          (injectedJavaScriptBeforeContentLoaded) to intercept any
          request containing get_transcript or timedtext
       2. load the real watch page in a hidden WebView, desktop
          userAgent forced (NOT &app=desktop -- that serves YouTube's
          legacy pre-2017 page instead, confirmed on-device, since fixed)
       3. after load + 2.5s, inject a script that dismisses a cookie-
          consent banner if present, then finds and clicks the real
          "Show transcript" button (so YouTube's own code issues the
          request, carrying a token it generates correctly)
       4. if nothing is intercepted within 5s of the click, fall back
          to reading the rendered ytd-transcript-segment-renderer DOM
          directly
       5. 9s global timeout -> unavailable if nothing worked
  -> segments imported into SQLite (listening_videos/listening_segments/
     listening_cards), captionStatus = available | auto_generated | unavailable
```

**Current status, from real device logs (2026-08-20):** the "Show transcript" button was not being found at all in the first test. Diagnosed to `&app=desktop` serving a legacy page structure with no modern `ytd-*` components; that parameter has been removed, desktop `userAgent` kept alone. **Not yet reverified on device.** If the button still isn't found once a modern page is confirmed, the next hypothesis (flagged by the user, not yet tried) is that the video description needs to be expanded ("...more") before the transcript button appears in the DOM on the real desktop site.

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
- `mobile/src/listening/TranscriptFetcher.tsx` — the WebView-based fallback, see above.
- `mobile/src/data/database.ts` — `listening_videos`/`listening_segments`/`listening_cards`/`listening_reviews` tables and their CRUD (no test coverage, see `docs/CONVENTIONS.md`).
- `mobile/src/data/settings.ts` — `listeningNewSegmentsPerDay`/`listeningReviewCapPerDay` (defaults 5/15, never tuned from real usage).

## Acceptance criteria

- [ ] Adding a real Spanish-language YouTube video from the app produces `captionStatus !== 'unavailable'` and at least one segment, for a video independently confirmed to have Spanish captions on youtube.com.
- [ ] At least one segment's transcript text is real, readable Spanish (not empty/garbled).
- [ ] A review session plays the video segment, accepts a typed answer, and grades it — this part is implemented and not currently suspected broken, but has not been exercised end-to-end because no video has successfully produced a segment yet.
- [ ] The same video does not repeat within 3 consecutive exercises when ≥4 videos have due segments (already covered by unit tests; real end-to-end confirmation still pending on the captions blocker above).

None of these are checked yet. Don't mark this feature "done" until the first box is checked with a real device screenshot/log.
