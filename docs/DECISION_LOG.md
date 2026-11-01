# Decision log: branch feat/backlog-next-steps

This is a record of what changed on this branch, why, and how each change was checked. It is
written for the repo owner. Read it in order: each phase builds on the one before it. Every phase
ends with a short "What to take from this" note, which is the part meant for learning.

Two people shaped this branch: the person who worked on it with Claude (called "the requester"
below) and Claude, which wrote the code. Where a choice was a product decision, the requester made
it, and this log says so. Where it was an engineering default, Claude chose it and gave a reason.

## Action needed from you

Before the next production release, apply two migrations to the production database, in this
order, with the same owner-gated procedure you used for migration 0005 (see "Owner-gated D1
authority migration procedure" in `CONTRIBUTING.md`):

1. `migrations/0006_retire_authoritative_mimma_seeds.sql` drops an unread table.
2. `migrations/0007_owner_authoritative_mimma_v2.sql` adds owner score snapshot v2.

Until both are applied, `release:production` refuses to deploy, by design. Phase 6 explains what
v2 contains. It changes the MiMMa scores that every visitor sees, so read that phase before you
apply it.

## Timeline

| Commit    | Date       | Summary                                                            |
| --------- | ---------- | ------------------------------------------------------------------ |
| `5782853` | 2026-10-30 | Remove unused auth aliases                                         |
| `ec02d3e` | 2026-10-30 | CI checks Worker types; React updates grouped; local run docs      |
| `3845105` | 2026-10-30 | Serve owner scores and similar games                               |
| `e6c71a4` | 2026-10-30 | Release checks derive from one manifest                            |
| `f345cce` | 2026-10-30 | Rate-limit Steam sign-in starts                                    |
| `367f32e` | 2026-10-30 | Project backlog and audit                                          |
| `2edd6c0` | 2026-10-30 | Small backlog cleanups                                             |
| `9da07c2` | 2026-10-31 | Site redesign ("Big Box")                                          |
| `3bbdc6d` | 2026-10-31 | Similar games: distance cutoff and shared-tag ranking              |
| `b772eb9` | 2026-10-31 | Retire the unread seed table (migration 0006)                      |
| `8d75498` | 2026-10-31 | MiMMa scoring rubric                                               |
| `0c2c691` | 2026-10-31 | Community research scripts on Steam's official APIs                |
| `221aae5` | 2026-10-31 | Rescoring report                                                   |
| `b5c37a0` | 2026-10-31 | Local-only research score preview                                  |
| `98a6f02` | 2026-10-31 | Owner snapshot v2 and an append-only release path (migration 0007) |

## Phase 1: audit, backlog, and first fixes (2026-10-30)

The first seven commits came from an earlier working session. Their reasoning is recorded in their
commit messages and in `docs/BACKLOG.md`. This section summarizes those sources; it does not add
reasons that were not written down at the time.

**The starting point.** An audit found the engineering base healthy but the product unwired:
owner-approved MiMMa scores for 8 of the 10 catalog games sat in the production database, yet no
page showed them, and the similar-games route returned 404. The audit is in `docs/BACKLOG.md`,
with findings (F1 to F16), owner decisions (D1 to D8), milestones (M1 to M6), and engineering
actions (A1 to A17).

**What was done.**

- `3845105` served the scores (M1) and added similar games (M2): Euclidean distance over the three
  axes, top 5, ties broken by title and then Steam app ID. The offline snapshot also carried the
  scores. The backlog marked the similarity rule and the offline scores as defaults for you to
  confirm (D1, D3).
- `e6c71a4` fixed a cost the audit measured: adding ten scores had touched 19 files, because
  release tooling copied the dataset by hand. `scripts/release-manifest.mts` became the single list
  of migrations, content hashes, and data files that the verifier reads (A2).
- `f345cce` rate-limited Steam sign-in starts to 10 per client IP per minute, because each start
  writes a database row and anonymous clients could call it without limit (A6).
- The remaining commits removed dead code, aligned CI with the local gate, documented local runs,
  and finished small cleanups (A1, A3, A5, A7, A10 to A16).

**What to take from this.** An audit is most useful when every finding cites evidence (file and
line) and every fix is traceable back to a finding. The backlog item IDs in these commit messages
let you check each change against the problem it was meant to solve.

## Phase 2: the site redesign (2026-10-31, `9da07c2`)

**The request.** Make the UI modern, clean, and memorable, without generic AI-generated design.

**Questions asked first.** Before designing, Claude asked the requester four questions, because
each answer changes the design:

| Question                                      | Requester's answer                         |
| --------------------------------------------- | ------------------------------------------ |
| May the page load cover art from Steam's CDN? | Yes; add it to the content security policy |
| Who is the primary visitor?                   | A player hunting for their next game       |
| May the UI copy be rewritten?                 | Yes, freely, but keep every fact           |
| How should the direction be chosen?           | Present 3 to 5 directions to choose from   |

The requester picked the "Big Box" direction from the options presented.

**The design system.** Each choice has a rule behind it, recorded in `DESIGN.md`:

- Games are physical boxes on a dark shelf; a game page is the back of its box. The metaphor gives
  every element a reason to look the way it does.
- The three printing-process inks carry only the MiMMa axes: cyan for Micro, magenta for Meso,
  yellow for Macro. Because no other element uses them, color always means an axis.
- Spot orange marks only the current game (the box spine on hover, the reference tick on the
  similar-games strips).
- Missing data prints as a plain ruled label ("Not yet scored", "Saved data") instead of
  disappearing, so a visitor can tell "no score" from "loading".
- One self-hosted variable font (Archivo), because the security policy forbids third-party fonts.

`PRODUCT.md` records the product facts the design had to respect.

**How it was checked.** A separate reviewer judged screenshots at desktop and phone widths over two
rounds; one requested fix (a faint shelf line) was improved afterwards and not re-reviewed. A
pattern detector for common AI-design tells ended with no findings. The full test gate passed.

**What to take from this.** Ask the questions whose answers change the work before doing the work.
Here, allowing the Steam CDN decided whether real cover art was possible at all, and that decided
which design directions were worth proposing.

## Phase 3: reviewing the MiMMa algorithm (2026-10-31, `3bbdc6d`, `b772eb9`, `8d75498`)

**The question.** The requester asked for a review of how MiMMa scores are generated.

**The finding that framed everything.** There is no generation algorithm. The owner assigned the
scores by hand; the code only stores them carefully (hash-pinned record, integer rounding,
immutable tables) and ranks by distance. So the review covered score quality and the ranking.

**Problems found.**

1. No rubric defined what a value means, so nobody could reproduce a score, and future community
   raters would have nothing to calibrate against.
2. Coarse scores collided: Marvel Rivals and Rainbow Six Siege had identical v1 scores, so their
   distance was 0 and alphabetical order decided which ranked first.
3. Similar games always returned 5 results, even when the nearest game was far away.
4. Three numbers cannot separate genres.
5. The seed import kept 62 of 141 surnex rows (only single-axis ones) and turned "high, low, low"
   into 100/0/0, which contradicts the label scale. Nothing read the table.
6. Each score update was a multi-file change.

**Decisions.**

| Change                      | Who decided      | Choice and reason                                                                                                                                 |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distance cutoff             | Claude (default) | Drop games more than 40 apart. One 20-point step on two axes is about 28, so 40 allows small differences and excludes clearly different profiles. |
| Tie-breaking                | Claude (default) | Add up to 20 points when two games share no Steam tags, shrinking as tag overlap rises. Tags reorder near matches but cannot outrank the profile. |
| Seed table                  | Requester        | Retire it (migration 0006) rather than keep or rebuild it. It was unread and its values were wrong.                                               |
| Spread for community scores | Requester        | Write the rule down now (median, rater count, range, provisional and disputed flags) but add no database columns until community scoring exists.  |
| Rubric                      | Claude (draft)   | `docs/MIMMA_RUBRIC.md`, anchored to the owner's own v1 values, with open calibration questions for the owner.                                     |

**Two things that went wrong, and the fixes.**

- The production verifier built its expected schema from `CREATE` statements only, so a migration
  that drops a table broke it. The verifier learned to handle `DROP`, and it now fails if a
  migration drops something that was never created.
- Deleted files were already staged when the first of three commits was made, so they landed in
  the wrong commit. Because nothing had been pushed, the three commits were rebuilt with each file
  in the right place.

**What to take from this.** Separate "what the code does" from "what the data means". The code
here was sound; the weak point was the meaning of the numbers, which only a rubric can fix.

## Phase 4: rescoring the catalog (2026-10-31, `0c2c691`, `221aae5`)

**The request.** Score every catalog game twice: once by Claude's judgment and once or more from
community sentiment.

**Method.** Three independent scorings, compared with the owner's v1 scores:

1. **Claude** applied the rubric to each game and recorded the scores before looking at any
   community data. They are not blind to v1, because the v1 values were already known, and the
   report says so.
2. **Steam tags**: player-voted tags, turned into scores through 86 reference games that have
   coarse surnex labels.
3. **Steam reviews**: how often each game's most helpful English reviews mention each axis's
   concepts, mapped to scores through the same reference games.

**Validating the instruments.** Before trusting a community method, it was tested on the reference
games, predicting each one with itself left out. Tags ranked them close to their labels (rank
correlations 0.80, 0.76, and 0.69 for Micro, Meso, and Macro). Reviews were weaker (0.71, 0.49,
0.64), and their Meso signal was too weak to separate games.

**Finding the right Steam endpoint.** The first attempt used Steam's store reviews endpoint, which
redirected every request to the store home page. Valve's partner documentation marks that endpoint
as deprecated and names its replacement, `IUserReviewsService/GetAppReviews`. It needs no key and
pages reliably with a cursor. The tag weights also have an official endpoint,
`IStoreBrowseService/GetItems`. Switching raised the review sample from about 33 to between 250 and
286 usable reviews per game, and the analysis was rerun.

**A bug found while porting the scripts.** The title matcher normalized Unicode before removing
trademark signs, which turned "™" into the letters "TM", so titles like "Apex Legends™" never
matched. The signs are now removed first, and a test covers it.

**Findings.** Micro was stable across every method. The largest disagreements with v1: Elden Ring
Meso 100 (other sources 50 to 60), Apex Legends Macro 100 (other sources 50 to 80), Rainbow Six
Siege Meso 60 (other sources 80 to 90). Full tables are in `docs/MIMMA_RESCORING_2026-10-31.md`.

**Privacy and data choices.** Downloaded reviews and tags live in `.cache/community-mimma/`, which
git ignores, because they are other people's text and can be downloaded again. Only aggregate
numbers are committed.

**What to take from this.**

- Validate an instrument before you trust its output. The review method looked plausible but
  measured Meso poorly, and only the leave-one-out test showed that.
- State a method's ceiling. Both community passes were fitted to labels of 20, 50, and 80, so they
  rarely report above 80. Comparing them directly against a v1 value of 100 would mislead.
- Check a claim against data before writing it down. The report's statement that complaint-heavy
  reviews skew the results was measured (more than half of the reviews for three games) before it
  went in.

## Phase 5: a local preview of the research scores (2026-10-31, `b5c37a0`)

**The request.** See the research scores on the site, with an option that includes all the data.

**What was built.** In local development only, adding `?scores=claude`, `tags`, `reviews`, or
`all` to a URL redraws the shelf strips, game pages, and similar games with that set, under a
banner. The requester asked for the fourth option, "all data"; it uses the median of every source
(owner v1, Claude, tags, reviews, surnex), which matches the combining rule in the rubric. Its game
pages list each source.

**Decisions.**

- The choice is remembered in the browser's local storage, because links between pages are plain
  page loads and would drop a URL parameter.
- All preview code sits behind the development flag. The production build was then searched for
  the preview's text, data, and storage key, and none of it was present.
- On a phone, the sources table scrolled the median column out of view, so the median moved next
  to the axis name.

**A bug an existing test caught.** One existing test renders the app without browser storage. It
failed, which exposed a real case: browsers that block site storage throw when it is read. The
preview now works without storage and simply forgets the choice between pages.

**What to take from this.** "Development only" is a claim you can verify: build for production and
search the output. Also, a failing old test is often reporting a real bug, not a test to update.

## Phase 6: owner snapshot v2 (2026-10-31, `98a6f02`)

**The decision.** The requester chose to make the "all data" median the real scores on the live
site, not only the local default. That makes it owner snapshot v2.

**What v2 contains.**

| Game                 | v1 (Micro / Meso / Macro) | v2           |
| -------------------- | ------------------------- | ------------ |
| Counter-Strike 2     | 100 / 65 / 80             | 80 / 70 / 60 |
| Palworld             | 40 / 20 / 70              | 45 / 35 / 80 |
| Marvel Rivals        | 80 / 60 / 80              | 80 / 60 / 70 |
| Apex Legends         | 80 / 80 / 100             | 80 / 80 / 70 |
| Rainbow Six Siege    | 80 / 60 / 80              | 80 / 80 / 80 |
| Baldur's Gate 3      | 20 / 20 / 100             | 30 / 50 / 85 |
| Monster Hunter Wilds | 80 / 40 / 60              | 80 / 50 / 60 |
| Elden Ring           | 80 / 100 / 40             | 75 / 55 / 60 |
| Destiny 2            | not scored                | 60 / 50 / 70 |
| BeamNG.drive         | not scored                | 50 / 30 / 40 |

League of Legends and Valorant are not in the catalog, so they keep their v1 scores.

**How it was built.** The database tables were designed to be append-only, and v2 respects that:

- `data/authoritative-records/owner-authoritative-mimma-v2.json` is the v2 record, pinned by hash.
  Each score keeps its exact median as the original decimal.
- `scripts/owner-authority-history.mts` turns the v1 and v2 records into every row the database
  must hold, and enforces the rules: a changed score gets a new version, an unchanged one is
  reused, no game is dropped or renamed, and versions cannot skip.
- `scripts/generate-owner-authoritative-mimma-v2.mts` writes migration 0007 from the rows v2 adds.
  The migration starts with a check that aborts it unless the database holds exactly the frozen v1
  history, so it cannot run twice or onto the wrong state.
- The production verifier, the release queries, and the bundled catalog snapshot all read from the
  same history module, so they cannot disagree. This completed backlog item M4.1.
- Both smoke tests now require Destiny 2 to be scored from snapshot v2, which catches a deploy
  against a database that never received 0007.

**How it was checked.**

- The verifier's test describes the expected v2 rows by hand, independently of the history module.
  The hand-written rows and the derived rows matched exactly, which is evidence that the module is
  right rather than merely self-consistent.
- On a real local database, running 0007 a second time aborted and left every row count unchanged.
- Many existing tests had used Destiny 2 or BeamNG.drive as "the unscored game". Where a test
  covers the unscored path, it now uses a test-only game, so that path is still tested.
- Final gate: 368 Node tests and 127 Worker tests pass, plus the build and both smoke checks.

**What to take from this.**

- Append-only data with hash-pinned sources gives you a full audit trail: you can always see which
  record introduced a row and when.
- Write at least one test oracle by hand. A test that derives its expectations from the code under
  test can only show the code agrees with itself.
- A data change that alters what users see deserves the same review as a code change. That is why
  this log asks you to read this phase before applying 0007.

## Open items

- Apply migrations 0006 and 0007 in production (see "Action needed from you").
- Review the v2 scores. If you disagree with any, the path is a v3 record and migration, built the
  same way v2 was; nothing in v1 or v2 needs to change.
- A future snapshot that changes a game's Steam mapping needs a supersession rule that has not been
  built yet. New scores alone work today.
- The rubric's calibration questions in `docs/MIMMA_RUBRIC.md` still need your answers, especially
  low anchors for each axis.
- Production carries about 2 KB of unused stylesheet rules for the local preview banner, because
  stylesheets are not tree-shaken.

## Where to read more

| Topic                         | Document                             |
| ----------------------------- | ------------------------------------ |
| Product facts and constraints | `PRODUCT.md`                         |
| Design system                 | `DESIGN.md`                          |
| Audit, decisions, milestones  | `docs/BACKLOG.md`                    |
| What a MiMMa value means      | `docs/MIMMA_RUBRIC.md`               |
| Rescoring method and results  | `docs/MIMMA_RESCORING_2026-10-31.md` |
| Running locally and releasing | `CONTRIBUTING.md`                    |
