# Conventions

Only what's actually enforced or consistently followed in this repo — not aspirational rules. TypeScript `strict: true` and Prettier-less formatting already constrain a lot; this file covers what a formatter can't.

## File naming & structure

- Components/screens: PascalCase (`ConjugationScreen.tsx`). Logic/data modules: camelCase (`database.ts`, `selection.ts`).
- Per-domain review flow, always three files: `XScreen.tsx` (browse, sub-tabs) → `XReviewContainer.tsx` (data loading + grading loop) → `XReviewScreen.tsx` (flashcard UI). See Decision 007 in `docs/DECISIONS.md` for why this isn't a shared abstraction — don't try to unify it as a drive-by refactor.
- Pure logic lives separate from React components whenever it can be tested standalone: `sm2/engine.ts`, `listening/selection.ts`, `stats/statsEngine.ts`, `scheduler/reviewScheduler.ts`, `validation/textAnswer.ts`. If you're writing testable logic, it goes in its own module, not inline in a component.
- Screen styling: every screen defines `function createStyles(t: SolYSombraPalette) { return StyleSheet.create({...}) }` at the bottom of the file, called via `useMemo(() => createStyles(theme), [theme])` at the top of the component. Styles are not shared between screens/files — each screen owns its own, even when near-identical to another (deliberate, see the comment in `ConjugationReviewScreen.tsx`).
- Sub-tabbed screens follow one pattern: `type SubView = 'a' | 'b' | ...`, a local `SubTabButton` component, a header block (`LEXIS` label + screen title + sub-tab row), then conditional `{subView === 'a' && <AView .../>}`.

## Error handling

- Network/parsing failures degrade silently to a sentinel (`null`, `[]`, `status: 'unavailable'`) — never throw out of a fetch/parse helper into UI code. This is deliberate for the listening feature (video stays in the library, just non-exploitable) and followed everywhere else too.
- Don't add validation/error handling for states that can't occur (internal calls, framework-guaranteed shapes). Validate at real boundaries: parsed JSON from bundled/external sources (`wordRepository.ts` drops malformed entries rather than failing the whole import), network responses, user text input.

## Database (`mobile/src/data/database.ts`)

- All queries parameterized (`?` placeholders) — never string-interpolate a value into SQL.
- Bulk inserts go through `insertInBatches` (batch size 80, chosen to stay well under SQLite's historical 999-bound-parameter limit) — never a `runAsync` per row for anything that could be thousands of rows.
- Schema changes are additive only (`CREATE TABLE IF NOT EXISTS`) — see Decision 011. A column added to an existing table needs its own explicit backfill/resync function if existing rows must pick it up (see `resyncWordTags` as the template) — `importMissingWords`-style functions are insert-only and silently won't do this for you.
- No SQL comments containing markdown-style backticks around identifiers — backticks inside a JS template-literal SQL string prematurely close the literal. Has caused a `tsc` syntax error twice already; write plain identifier names in SQL comments.

## Testing

- `*.test.ts` co-located next to the source file it tests, `jest-expo` preset.
- Only pure, side-effect-free logic is unit tested. React components/screens have no test coverage (no React Testing Library set up). `database.ts` has no coverage at all — no in-memory SQLite double exists for Jest here; verify DB changes by reasoning + a real device, not by writing a test that can't run.
- WebView-injected JS (template-literal strings passed to `injectedJavaScript*`) isn't type-checked by `tsc` and isn't unit-testable either — verify syntax with `new Function(body)` in a throwaway Node script before considering it done, and remember that its actual DOM/network behavior can only be confirmed by a human on a real device.

## Logging

- Temporary diagnostic logging (used repeatedly this project to debug WebView/network issues sight-unseen) is tagged with a bracketed source prefix, e.g. `console.log('[TranscriptFetcher]', step, ...)`, and called out in a comment as temporary/diagnostic. Never log cookies, tokens, or other secrets in these.

## Comments

- French, and explain *why*, not *what* — identifiers are already named clearly enough to skip restating behavior. A comment earns its place by capturing a non-obvious constraint, a rejected alternative, or a dated decision (often with a one-line pointer to root `AUDIT.md`/`PLAN.md` for the full story).
- Don't add a docstring-style comment block to every function — most functions in this codebase have none.

## Git / commits

- Commit messages in English (documentation and in-app UI are French; commits are the one place this project has used English), ending with the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.
- Never amend a pushed commit, never force-push, never skip hooks.
- Before calling any change done: `npx tsc --noEmit`, `npx jest --watchAll=false`, and a Metro bundle boot-check (`expo start` + `curl` the bundle URL) — all three, every time, not just the ones that seem relevant to the change.
- Update the relevant root `PLAN.md`/`AUDIT.md` entry (dated, French, with the verification line above) for any behavior change — see `docs/CONVENTIONS.md`'s sibling files for the *why*; this is enforced by habit in this project, not tooling.

## Dependencies

- Bias toward hand-rolled logic over a new npm package, especially for anything Expo-Go-compatibility-sensitive (`youtubeUrl.ts`'s regex-based parser instead of the `URL` global, `search.ts`'s `ytInitialData` scrape instead of a scraping library, `captions.ts`'s regex XML parser instead of an XML library). Live-test a candidate package before trusting it (see Decision 004 — `spanish-verbs` was tested and rejected before writing a line of generation code around it).
- Before adding any native dependency, confirm it's Expo-Go-compatible (no custom native module requiring a dev build) — this is the project's hardest constraint, see `CLAUDE.md`.
