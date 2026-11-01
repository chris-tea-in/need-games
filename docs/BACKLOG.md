# Need Games backlog and audit

A living record of what is built, what is missing, and what to do next. It started on 2026-10-30
from a full audit of `main` at commit `3dc01d2` (last merged 2026-08-21).

## How to use this file

- Work items have IDs. `M` items are roadmap milestones, `A` items are engineering fixes, and `D`
  items are decisions for the repository owner.
- Tick an item when its PR merges and add the PR number, for example `- [x] A1 ... (#26)`.
- `F` items are the audit findings behind the work items. Their line numbers describe `3dc01d2` and
  will drift as the code changes.
- Items marked (owner) need the repository owner (chris-tea-in on GitHub): merging, repository
  settings, branch deletion, or a production release. Contributors propose everything else as PRs.
- The repository is public. F5 and A6 describe a missing rate limit on a production endpoint. Raise
  them with the owner privately before this file lands in a public commit.
- Re-run every gate with `corepack pnpm check:local` before ticking an item.

## Where the project stands

The engineering base is healthy. Every gate passes, the tests are thorough (374 tests, including
real D1 and a headless Chrome layout check), and the Steam sign-in code is careful. The gap is
product wiring. Owner-approved MiMMa scores for 8 of the 10 catalog games already sit in production
D1, and the score queries and the score graph component exist and are tested. Nothing connects them,
so every game page in production still says "Score unavailable", and similar games returns 404. The
change that would help most is M1 (serve and show scores), then M2 (similar games). The main
engineering cost is that each data release is a 19-file change (F3), which every future catalog or
score update will pay unless A2 lands first.

### Roadmap status

| Roadmap item (README.md:25-30)          | Built                                                                                                                | Missing                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Curated, review-gated catalog           | 10 Steam games, admission rule v1, D1 seed, bundled offline snapshot, browse, search, and sort UI                    | Committed Steam fetcher, version-aware generators, a UI that can show more than 50 games |
| Authoritative MiMMa scores              | Frozen snapshot v1 in D1 (10 scored games, 8 mapped to catalog games), repository queries, `MimmaGraph`, label scale | API contract field, Worker wiring, UI rendering                                          |
| Similar-game discovery                  | Candidate query `findScoredSimilarityCandidates`                                                                     | Ranking logic, route, contract, UI; candidate rows have no `slug`                        |
| Community MiMMa contributions           | Prerequisites only: Steam sign-in, sessions, CSRF tokens                                                             | Design, schema, endpoints, UI, abuse limits                                              |
| Steam profiles and recommendations (V2) | Sign-in with verified display name, live in production                                                               | Profile page, owned-games import, recommendation logic                                   |

Score coverage in `data/authoritative-records/owner-authoritative-mimma-v1.json`:

- Scored and in the catalog: Counter-Strike 2, Palworld, Marvel Rivals, Apex Legends, Rainbow Six
  Siege, Baldur's Gate 3, Monster Hunter Wilds, Elden Ring.
- Scored but not in the catalog (not on Steam): League of Legends, Valorant.
- In the catalog with no score: Destiny 2, BeamNG.drive.

Production on 2026-10-30 (read-only GETs to `https://myplayprint.e9k.workers.dev`): catalog
`catalog-release-v1` with 10 games, `/api/session` reports `steamSignInEnabled: true`, and
`/api/games/counter-strike-2/similar` returns 404.

## Status on branch feat/backlog-next-steps (2026-10-30)

The ticked items below are implemented on the local branch `feat/backlog-next-steps`. They are not
committed or merged yet. `corepack pnpm check:local` passes on that branch: 300 Node tests, 124
Worker tests, the build, Worker types, and the local Worker smoke test.

- Scores and similar games (M1, M2): the detail API returns the score, the page shows the MiMMa
  graph, and `/api/games/:slug/similar` ranks the other scored games. The ranking keeps games
  within a Euclidean distance of 40 over micro, meso, and macro, orders them by distance plus a
  20-point tag mismatch penalty, shows at most 5, and breaks ties by title and then Steam app ID
  (`src/shared/similarity.ts`, explained in `docs/MIMMA_RUBRIC.md`). Each match carries its shared
  Steam tags. The bundled offline snapshot now carries the scores and ranks
  similar games locally. These two choices are defaults for D3 and D1, so the owner should
  confirm or change them before merging.
- Release checks: the production smoke now requires a scored Counter-Strike 2 detail, a non-empty
  similar list, and `unscored_game` for Destiny 2. A `--smoke-only` run against the deployment that
  predates this release fails those checks by design.
- A2: `scripts/release-manifest.mts` lists the migrations with content hashes and points at the
  catalog and owner-authoritative data. The verifier derives its expected authority rows from the
  hash-pinned record, the release smoke reads the catalog size and version from it, the Worker test
  helper applies every migration file, and `tests/release-manifest.test.ts` fails if a migration
  file is missing from the manifest. Still manual: the trigger, index, and table list in
  `resetBetaDatabase` (`tests/worker/apply-beta-migrations.ts`) and the v1-only record validator
  (M4.1).
- A6: `AUTH_START_RATE_LIMITER` allows 10 sign-in starts per client IP per minute, in both
  environments, before any D1 write; over the limit returns 429 `rate_limited`.
- Cleanup on branch `chore/backlog-cleanup` (based on `feat/backlog-next-steps`): A10, A11, A12,
  A13, A14, A15, and A16. `/favicon.ico` and `/favicon.svg` now serve icons, API responses carry
  `X-Content-Type-Options: nosniff`, game pages set their own title, and the release contract test
  checks commands, headings, and the manifest's migration names instead of prose.

## Decisions needed (owner)

- [ ] D1 Offline snapshot and scores. Should `src/ui/generated/catalog-snapshot.ts` carry scores, or
      should degraded mode show the unscored panel? Blocks M1.5.
- [x] D2 Scores for Destiny 2 and BeamNG.drive. Owner snapshot v2 (2026-10-31) scores both, from
      the median in `docs/MIMMA_RESCORING_2026-10-31.md`.
      Does not block M1, because the unscored state stays.
- [ ] D3 Similarity definition: the distance over the three axes (for example Euclidean on 0-100),
      the result count, the tie-break, any minimum similarity, and what to show when few scored
      neighbors exist. Blocks M2.
- [ ] D4 Catalog growth: target size, admission criteria v2, and how often to refresh Steam review
      data. The current data was fetched on 2026-08-14. Blocks M3.
- [ ] D5 Sign-in exposure. Production offers Steam sign-in, but a signed-in user can only sign out.
      Keep it visible, or use the kill switch (CONTRIBUTING.md:198-207) until a signed-in feature
      ships.
- [ ] D6 Privacy. The Worker stores SteamIDs and display names with no privacy notice and no way to
      delete an account (F9). Decide the notice and the deletion policy. Blocks A8 and M5.
- [x] D7 Legacy tables. The owner retired `authoritative_mimma_seeds`: migration 0006 drops it and
      its triggers, and the seed generator and its checks are gone. Production releases stop until
      the owner applies 0006 with the file-ingestion procedure in CONTRIBUTING.md.
      `data/surnex-dataset.csv` stays as a source of low-anchor candidates for the rubric.
      `authoritative_mimma_scores` (migration 0001, empty, unread) stays for now.
- [ ] D8 Voting design. CONTRIBUTING.md:195 mentions "reopening voting", and the PR template points
      to a "vault plan", so a design may exist outside this repo. Link it here, or write it as M5.0.

## Next steps

Recommended order:

1. Quick wins: A1, A3, A5, A7, A9, A10, A12. All are small and independent. A4 needs the owner.
2. M1, show scores. It has the highest product value, and the data is already in production.
3. M2, similar games, once D3 is settled.
4. A2, one release manifest, before any new catalog or score release (M3, M4).
5. A6 (rate limits) and A8 (privacy), before M5 or any wider launch.
6. M3 and M4 data pipelines, then M5, then M6.

### Milestones

#### M1. Show authoritative scores (effort M)

Why: 8 of 10 catalog games have owner-approved scores in production D1 (F1), but every detail page
says "Score unavailable".

- [x] M1.1 Widen the contract. `GameDetail.authoritativeScore` becomes a score object or `null`, and
      `isGameDetail` accepts both.
  - Files: `src/shared/catalog-contract.ts:39-43`, `:185-203`.
  - Note: the API echoes the dataset `schema_version` from D1 (`src/worker/router.ts:31-39`), so
    bumping `CATALOG_SCHEMA_VERSION` also touches the stored metadata. A tab still running the old
    bundle rejects the new shape and falls back to the snapshot, which is safe.
  - Done when: validator tests cover a scored game, an unscored game, and out-of-range values.
- [x] M1.2 Serve the score from the Worker. Reuse `getMappedAuthoritativeScoreFromLatestSnapshot`
      (`src/worker/repositories/authoritative-scores.ts:104`).
  - Files: `src/worker/repositories/games.ts:87-94`, `:139-154`, `src/worker/routes/games.ts`.
  - Keep `gameExists` cheap. The sign-in return-path check calls it (`src/worker/routes/auth.ts:269`).
  - Done when: local `GET /api/games/counter-strike-2` returns micro 100, meso 65, macro 80, and
    `GET /api/games/destiny-2` returns `authoritativeScore: null`.
- [x] M1.3 Render `MimmaGraph` (`src/ui/mimma-graph.tsx:24`) on the detail page when a score exists.
      Keep the unscored panel for `null`. Show the snapshot version and approval date as provenance.
  - Files: `src/ui/game-detail-page.tsx:64-71`, `tests/ui/game-detail-page.test.tsx`,
    `tests/ui/visual-layout.test.tsx`.
- [ ] M1.4 Optional: a compact graph on catalog cards. This needs a score on `CatalogCard` and one
      batch query instead of a query per game.
  - Files: `src/shared/catalog-contract.ts:30-37`, `src/worker/repositories/games.ts:96-137`,
    `src/ui/catalog-page.tsx:74-87`.
- [x] M1.5 Offline snapshot, per D1. `scripts/generate-catalog-artifacts.mts:22-33` hard-codes
      `authoritativeScore: null`.
- [x] M1.6 Update the copy: `README.md:21`, `src/ui/catalog-page.tsx:39-42`,
      `src/ui/game-detail-page.tsx:66-70`.
- [x] M1.7 Make the release checks assert a score, not only a 200.
  - Files: `scripts/check-local.mjs:215-218`, `scripts/release-production.mts:833-836`, the smoke
    description in `CONTRIBUTING.md:180-183`, and the prose assertions in
    `tests/repository-contract.test.ts`.
- Milestone done when: all gates pass, the local app shows graphs for the 8 scored games and the
  unscored panel for Destiny 2 and BeamNG.drive, and the release smoke checks a score.

#### M2. Similar-game discovery (effort M, needs D3, after M1.1)

Why: `/api/games/:slug/similar` is a stub (F2).

- [x] M2.1 Write the ranking as a pure function with unit tests, for example
      `rankSimilarGames(selected, candidates, limit)`. Reuse the repository's tie-break: title, then
      Steam app ID (`src/worker/repositories/authoritative-scores.ts:173`).
- [x] M2.2 Add `slug` to the candidate query so the UI can link results. `ScoredSimilarityCandidate`
      has only `steamAppId` and `title` (`authoritative-scores.ts:12-15`, `:155-176`).
- [x] M2.3 Move the shared helpers out of `src/worker/routes/similar-games.ts` before it gains real
      logic. `isValidSlug`, `gameExists`, and `unavailableVersion` serve the router and auth (F12).
- [x] M2.4 Replace the stub (`src/worker/router.ts:80-96`). Add a `SimilarGamesResponse` type and
      validator to `src/shared/catalog-contract.ts`. Keep the `unscored_game` 404 for games with no
      score.
- [x] M2.5 Add a "Similar games" section with links to the detail page.
- [x] M2.6 Update the checks that require today's 404: `scripts/check-local.mjs:217`,
      `scripts/release-production.mts:843-846`, `CONTRIBUTING.md:181`. Keep one check that an
      unscored game (`destiny-2`) still returns `unscored_game`.
- Milestone done when: the Counter-Strike 2 page lists ranked neighbors from the other 7 scored
  games, the Destiny 2 page shows no list, and all gates pass.

#### M3. Catalog growth pipeline (effort L, needs D4 and A2)

Why: the catalog is fixed at release v1, and the tooling can only regenerate v1 artifacts (F3).

- [ ] M3.1 Commit a Steam metadata fetcher. A script fetched the v1 data at two-second intervals on
      2026-08-14 (see the `fetchedAt` values in `data/catalog-release-v1.json`), but that script is
      not in the repo. Output a new `data/catalog-release-vN.json` that passes
      `scripts/validate-catalog-release.mts`.
- [ ] M3.2 Make `scripts/generate-catalog-artifacts.mts` version-aware (its paths are fixed at
      `:14-16`). Emit a new append-only migration for new games and refreshed review data instead of
      rewriting `0002`, which production has applied and the verifier hash-pins.
- [ ] M3.3 Remove the 50-game ceiling before the catalog passes 50 (F8). Add pagination, or move
      search and sort to the server. Pick one owner for search behavior: the client matches title
      and tags, and the server matches title only.
- [ ] M3.4 Decide whether games need a lifecycle beyond `main_catalog`. The schema allows only that
      value (`migrations/0001_schema.sql:19`), so hiding or retiring a game needs a migration.
- Done when: adding 5 games is one data PR that changes only the JSON, one generated migration, the
  snapshot, and the A2 manifest.

#### M4. Authority data releases (effort M, needs A2, content from D2)

Why: the schema supports corrections and new snapshots (`approval_reason` values `owner-correction`
and `owner-restore`, versioned snapshots, and `supersedes_mapping_id` in
`migrations/0005_owner_authoritative_mimma_v1.sql`), but the generator only emits v1.

- [x] M4.1 Append-only authority releases. `scripts/owner-authority-history.mts` turns the v1 and
      v2 records into every expected row; `scripts/generate-owner-authoritative-mimma-v2.mts` renders
      `migrations/0007_owner_authoritative_mimma_v2.sql` from the rows v2 adds (new score versions,
      the v2 snapshot, new mappings); the verifier checks the whole history. A v3 still needs its
      own generator entry and a supersession rule for changed mappings.
- [x] M4.2 Destiny 2 and BeamNG.drive are scored in v2. Production needs migrations 0006 and 0007
      applied by the owner before the next release.
- Done when: a v2 snapshot lands without editing the verifier body.

#### M5. Community MiMMa contributions (effort L, needs D6, D8, A6, A8)

Nothing exists yet beyond sign-in.

- [ ] M5.0 Design: one submission per user per game, revision rules, who counts as verified (for
      example Steam ownership or playtime; the Steam Web API returns owned games only when the
      player's game details are public), how community and authoritative scores appear side by
      side, moderation, and abuse limits. Aggregation is specified in `docs/MIMMA_RUBRIC.md`
      ("Combining raters"): median per axis, rater count, lowest and highest score, provisional
      below 5 raters, disputed above a 40-point spread.
- [ ] M5.1 Schema migration and repository, with Worker tests.
- [ ] M5.2 A write endpoint that reuses the logout CSRF pattern (`X-CSRF-Token` checked against the
      session hash, `src/worker/routes/auth.ts:616-657`) and the A6 rate limiter.
- [ ] M5.3 UI for submitting and viewing contributions.

#### M6. Steam profiles and recommendations (V2, effort L, after M2 and M5)

- [ ] M6.1 A profile page for the signed-in user. `getPublicUserProfile`
      (`src/worker/repositories/identity.ts:420`) exists, and only tests call it.
- [ ] M6.2 Owned-games import, and recommendations built on the M2 ranking.

### Engineering actions

There are no P0 items. Every gate passes, and the audit found no data-loss path, crash, or
exploitable hole.

P1

- [x] A1 Run `typecheck:worker` in CI and keep one canonical gate list. (quick win, S) (F4)
  - Files: `.github/workflows/ci.yml:52-53`, `scripts/check-local.mjs:61-73` (add `release:check`),
    `tests/check-local.test.ts`, `CONTRIBUTING.md:43-51`, `.github/pull_request_template.md:11-14`,
    and `tests/repository-contract.test.ts`, which asserts the CI job contents.
  - Done when: CI fails on a stale `worker-configuration.d.ts`, and the docs point at `check:local`
    instead of repeating the command list.
- [x] A2 One release manifest for migrations and data expectations. (M) (F3) Unblocks M3 and M4.
  - Files: `scripts/verify-production-d1.mts` (`:7-13`, `:15-80`, `:512-519`, `:583-586`, `:717`,
    `:756`, `:792`), `tests/worker/apply-beta-migrations.ts` (`:1-5`, `:28-34`, `:46` onward),
    `scripts/release-production.mts:35-37`, `CONTRIBUTING.md:125-127`, `:152`.
  - Direction: derive the verifier's expected identities, scores, and counts from
    `data/authoritative-records/*.json` after checking the pinned hash. That keeps tamper detection
    and removes the hand copy. For the Worker test helper, evaluate `readD1Migrations` (exported by
    `@cloudflare/vitest-pool-workers` 0.21.3) with `applyD1Migrations` from `cloudflare:test`. Test
    it against the compound triggers in `0005` first, because CONTRIBUTING says ordinary migration
    application is unverified for them.
  - Done when: a test adds a fake migration 0006 and a record v2, and only the manifest and the data
    files change.

P2

- [x] A3 Fix Dependabot grouping and reviewers. (quick win, S) (F6)
  - Files: `.github/dependabot.yml:12-24`, `:36-37`; add `.github/CODEOWNERS`.
  - Done when: `react`, `react-dom`, `@types/react`, and `@types/react-dom` update in one PR with
    green CI, and new Dependabot PRs request a review.
- [ ] A4 Review and merge the green Dependabot PRs: #23 (10 dev dependencies, open since 2026-09-21)
      and #24 (setup-node 7.1.0). Close #25, or add the matching `react-dom` bump. (quick win, S,
      owner)
  - Done when: no Dependabot PR is older than two weeks, and none is red.
- [x] A5 Add a local run section to README or CONTRIBUTING. (quick win, S) (F7)
  - Content: Node 24.18 or later, `corepack pnpm install --frozen-lockfile`,
    `corepack pnpm exec wrangler d1 migrations apply NEED_GAMES_DB --local`, then
    `corepack pnpm dev`. Explain the "Showing saved catalog data" banner that appears when local
    migrations are missing. Explain that Steam sign-in needs an HTTPS origin, so it cannot run on
    `http://localhost`.
  - Done when: a fresh clone reaches a working catalog by following only the docs.
- [x] A6 Rate-limit sign-in start and every future write endpoint. (M) (F5)
  - Files: `wrangler.jsonc` (a `ratelimits` binding; the installed Wrangler 4.123.0 schema supports
    it), `src/worker/routes/auth.ts:300-359`, regenerated `worker-configuration.d.ts`, Worker tests.
  - Done when: requests over the limit get a 429 in the auth error shape and write nothing to D1.
- [x] A7 Delete unused alias exports and option aliases in the auth modules. (quick win, S) (F10)
  - Keep `createSteamNonceReplayGuard` only if its tests still matter. Production replay protection
    is the D1 nonce constraint.
  - Done when: each auth concept has one exported name, and all gates pass.
- [ ] A8 Privacy notice and account deletion, per D6. (M) (F9)
  - `sessions.user_id` has `ON DELETE CASCADE` (`migrations/0004_identity_sessions.sql:49`). Add a
    Worker test that deleting a user removes their sessions.

P3

- [x] A9 Use `AUTH_ROUTES` in `src/worker/router.ts:18-25`, and `CATALOG_SCHEMA_VERSION` in
      `router.ts:34`, `:38` and `routes/similar-games.ts:13`. (quick win, S) (F12)
  - Done when: no auth path string or schema version literal remains in the router.
- [x] A10 Derive the cookie `Max-Age` values from the session-contract lifetimes. (quick win, S)
      (F13)
  - Done when: each lifetime is defined once, in `src/shared/session-contract.ts`.
- [x] A11 Say in CONTRIBUTING that `test:coverage` covers the Node suite only, or add Worker
      coverage. Set `passWithNoTests: false` in `vitest.worker.config.ts`. (S) (F14)
  - Done when: a reader of the coverage report knows what it measures, and an empty Worker suite
    fails.
- [x] A12 Set `X-Content-Type-Options: nosniff` in `jsonResponse` (`src/worker/http.ts:15-21`).
      (quick win, S) (F15)
  - Done when: a Worker test asserts the header on a catalog response.
- [x] A13 Add a favicon and a meta description, and set `document.title` per game
      (`src/ui/App.tsx:121-123`). (S) (F16)
  - Done when: `/favicon.ico` returns an image, and a game page's title names the game.
- [x] A14 Replace the `.mjs` re-export shims with direct `.mts` imports through
      `allowImportingTsExtensions`. (S) (F16)
  - Done when: both shims are deleted, and `release:check` plus the release entrypoint tests pass.
- [x] A15 In `tests/repository-contract.test.ts:128-222`, assert commands and variable names instead
      of prose phrases. (S) (F16)
  - Done when: rewording a CONTRIBUTING sentence without changing a command needs no test edit.
- [x] A16 Share the UI formatters (`src/ui/catalog-page.tsx:15-17`,
      `src/ui/game-detail-page.tsx:10-19`, `src/ui/offline-notice.tsx:7-10`). (S) (F16)
  - Done when: each format is defined once.
- [ ] A17 Delete the stale remote branches `chore/remove-surnex-source-urls` and
      `technology/toolchain`. (S, owner) (F16)
  - Done when: `git branch -r` lists only `main` and open PR branches.
- [x] A18 README: say that Steam sign-in is live, and reword the V2 roadmap line (`README.md:21`,
      `:30`). (S) (F16)
  - Done when: the README matches what production serves.

## Audit findings

Each finding lists its evidence, its cost, and a fix direction. Confidence is either verified (the
command ran, or the code path was traced exactly) or observed (read, not executed).

### F1. Scores are stored but not served

Product gap. Verified.

- Evidence: production D1 holds a frozen snapshot with 10 scored games, 8 of them mapped to catalog
  games (`data/authoritative-records/owner-authoritative-mimma-v1.json`,
  `migrations/0005_owner_authoritative_mimma_v1.sql`). The read functions
  `getMappedAuthoritativeScoreFromLatestSnapshot`, `findScoredSimilarityCandidates`, and
  `getFrozenAuthoritativeSnapshot` (`src/worker/repositories/authoritative-scores.ts:104`, `:141`,
  `:185`) have no importer under `src/`. Only `tests/worker/repositories.test.ts` calls them. The
  contract fixes `authoritativeScore: null` (`src/shared/catalog-contract.ts:40`), and the validator
  rejects any other value (`:196`). `src/worker/repositories/games.ts:90` always sets `null`.
  `MimmaGraph` (`src/ui/mimma-graph.tsx:24`) renders only in tests. The detail page always shows
  "Score unavailable" (`src/ui/game-detail-page.tsx:64-71`).
- Cost: the product's core idea is invisible, although the data and most of the code exist.
- Fix: M1.

### F2. Similar games is a stub

Product gap. Verified.

- Evidence: `src/worker/router.ts:80-96` returns an `unscored_game` 404 for every existing game. No
  ranking code exists under `src/`; a search for euclid, cosine, distance, nearest, and rank found
  none. Candidate rows carry no `slug` (`src/worker/repositories/authoritative-scores.ts:12-15`).
- Fix: M2.

### F3. Every data release is a 19-file change

P1. Verified.

- Evidence: PR #16 (`a92b499`) touched 19 files, with 5,283 insertions and 362 deletions, to add 10
  scores. The production verifier hand-copies the dataset: the migration list
  (`scripts/verify-production-d1.mts:7-13`), the identities (`:17-28`), the score tuples (`:30`
  onward), the counts (`:512-519`, `:583-586`, `:717`, `:756`), and the dataset version (`:792`).
  The Worker test helper repeats the migration list, the order, and the trigger names
  (`tests/worker/apply-beta-migrations.ts:1-5`, `:28-34`, `:46` onward). The release smoke pins the
  catalog size and version (`scripts/release-production.mts:35-37`). The generators write only v1
  paths (`scripts/generate-catalog-artifacts.mts:14-16`,
  `scripts/generate-owner-authoritative-mimma.mts:10`, `:49`, `:97-102`,
  `scripts/generate-authoritative-mimma-seed.mts:45-46`). CONTRIBUTING enumerates the migrations and
  counts (`CONTRIBUTING.md:125-127`, `:152`), and `tests/repository-contract.test.ts` pins that
  prose.
- Cost: every catalog or score update repeats this chain by hand.
- Fix: A2, then version-aware generators (M3.2, M4.1).
- Tension: the verifier keeps its own copy so it can catch bad data. The source record is already
  hash-pinned (`scripts/verify-production-d1.mts:15`), so deriving expectations from it after the
  hash check keeps that protection. Removing the duplication wins.

### F4. The gate lists have drifted, and CI skips the Worker type check

P1. Verified.

- Evidence: CI runs 10 commands (`.github/workflows/ci.yml`), and `typecheck:worker` is not one of
  them. `scripts/check-local.mjs:61-73` runs `typecheck:worker` but not `release:check`.
  `CONTRIBUTING.md:43` says to run "the same commands" that CI runs, then lists 5 (`:45-51`). The
  PR template lists 4 (`.github/pull_request_template.md:11-14`). CONTRIBUTING requires regenerating
  Worker types when the sign-in flag changes (`:187`, `:200`), and CI never checks it.
- Cost: a PR can pass CI with a stale `worker-configuration.d.ts`. The owner-run release catches it
  later, through `check:local`.
- Fix: A1.

### F5. Anonymous requests write to D1 with no rate limit

P2, security hardening. The mechanism is verified by tracing the code. The impact is an estimate.

- Evidence: each `GET /api/auth/steam/start?return=/` inserts a `steam_login_transactions` row
  (`src/worker/routes/auth.ts:315-340`) after deleting up to 25 expired rows (`:56`, `:281`).
  Nothing under `src/` or in `wrangler.jsonc` limits request rates. The only rate-limit code handles
  Steam API 429 responses (`src/worker/auth/steam-profile.ts:252`). Production has sign-in enabled.
- Cost: any client can drive D1 writes at request rate. The real impact depends on the account's D1
  limits, which this audit did not check.
- Fix: A6, before M5 adds more write endpoints.

### F6. Dependabot cannot update React, and its reviewer setting does nothing

P2. Verified.

- Evidence: the only group covers development dependencies (`.github/dependabot.yml:19-24`), so PR
  #25 moved `react` to 19.3.1 and left `react-dom` at 19.2.8. Its Tests job fails 11 suites with
  "Incompatible React versions". The `reviewers` setting (`:12-13`, `:36-37`) produced no review
  request on #23, #24, or #25. Green PRs #23 and #24 have waited since 2026-09-21 and 2026-10-13.
- Fix: A3, A4.

### F7. No instructions for running the app locally

P2, docs. Verified.

- Evidence: no Markdown file mentions `pnpm dev`, `vite`, `localhost`, `--local`, or local
  migrations. Without local migrations, the catalog query fails, the Worker returns 503
  (`src/worker/router.ts:129-133`), and the UI switches to the bundled snapshot with a "Showing saved
  catalog data" banner (`src/ui/api-client.ts:64-65`). Steam sign-in cannot run on
  `http://localhost`: the trusted origin must be HTTPS (`src/worker/routes/auth.ts:119-140`) and
  must match the request origin (`:311`). On the audit machine, Node 24.4.1 ran with only an engine
  warning, although the repo pins 24.18.0.
- Fix: A5.

### F8. The UI shows at most 50 games, and search exists twice

P2, latent. Verified by trace.

- Evidence: the UI calls `/api/catalog` with no parameters (`src/ui/api-client.ts:61`). The
  repository defaults to 50 (`src/worker/repositories/games.ts:98`), and the route caps the limit at
  50 (`src/worker/routes/catalog.ts:38-44`). The UI filters and sorts on the client by title and tags
  (`src/ui/catalog-state.ts:12-27`). The server's search matches titles only (`games.ts:129`), and
  the UI never calls it.
- Cost: from the 51st game on, games disappear from the catalog and from search, with no error.
- Fix: M3.3, before the catalog passes 50.

### F9. No privacy notice and no account deletion

P2, trust. Verified.

- Evidence: the Worker stores SteamIDs, display names, and sessions
  (`migrations/0004_identity_sessions.sql:1-59`). Nothing under `src/` or in the docs mentions
  privacy or deletion. `src/worker/repositories/identity.ts` never deletes a user. It only deletes
  expired sessions and login transactions (`:518-554`). Sign-in is live in production.
- Fix: D6, then A8.

### F10. Unused aliases across the auth modules

P2, dead code. Verified with ripgrep across `src`, `tests`, and `scripts`.

- Evidence: `parseCookieHeader` and its alias `parseCookies`
  (`src/worker/auth/session-cookie.ts:90-111`), `readCookie` (`:152`), `hashTokenHex` and
  `timingSafeEqual` (`src/worker/auth/token-hash.ts:59`, `:75`), five aliases in
  `src/worker/repositories/identity.ts:556-560`, `validateSteamOpenIdAssertion`
  (`src/worker/auth/steam-openid.ts:561`), three aliases in `src/worker/auth/steam-profile.ts:355-357`,
  and the re-exports in `src/worker/routes/auth.ts:702` have no importers.
  `SteamOpenIdValidationOptions` accepts four alias pairs (`steam-openid.ts:35-52`), and
  `steam-profile.ts:336` accepts `logger` or `onError`. Production passes `productionOrigin`,
  `callbackUrl`, and `fetcher`, and no replay guard. The in-memory `createSteamNonceReplayGuard`
  (`steam-openid.ts:474`) is used only by tests. Production replay protection is the unique nonce
  column (`migrations/0004_identity_sessions.sql:38`), enforced through `consumeLoginTransaction`.
- Cost: readers cannot tell which name is canonical, and security code carries surface no caller
  uses.
- Fix: A7.

### F11. Two legacy score tables have no readers

P3. Verified.

- Evidence: no migration inserts into `authoritative_mimma_scores` (`migrations/0001_schema.sql:27-42`).
  `authoritative_mimma_seeds` holds 62 single-axis rows derived from `data/surnex-dataset.csv`
  (`migrations/0003_authoritative_mimma_seed.sql`). No code under `src/` reads either table. Both
  are immutable through triggers, and the release verifier pins both.
- Fix: D7. Migration 0006 retires the seed table; the empty scores table remains.

### F12. Shared helpers live in the similar-games route module

P3. Verified.

- Evidence: `isValidSlug`, `gameExists`, and `unavailableVersion` sit in
  `src/worker/routes/similar-games.ts:4-14`, and `src/worker/router.ts:7` and
  `src/worker/routes/auth.ts:49` import them. `router.ts:18-25` repeats the four auth paths that
  `AUTH_ROUTES` already defines (`src/shared/session-contract.ts:24-29`). `router.ts:34`, `:38` and
  `similar-games.ts:13` use the literal `1` instead of `CATALOG_SCHEMA_VERSION`.
- Cost: an auth route added only to `AUTH_ROUTES` would answer unexpected failures with the catalog
  error shape instead of the auth one (`router.ts:129-133`).
- Fix: A9 and M2.3.

### F13. Session lifetimes are defined twice

P3. Verified.

- Evidence: the cookie `Max-Age` constants (`src/worker/auth/session-cookie.ts:4-5`) repeat the
  database lifetimes (`src/shared/session-contract.ts:33-34`). The values match today.
- Cost: changing one puts cookie expiry and database expiry out of step.
- Fix: A10.

### F14. Coverage numbers leave out the Worker suite

P3. Verified.

- Evidence: `test:coverage` uses `vitest.config.ts`, which excludes `tests/worker/**` (`:6`). As a
  result, `router.ts` reports 27% and `routes/catalog.ts` 0%, although `tests/worker/routes.test.ts`
  exercises both. No thresholds are set (`:8-11`). `vitest.worker.config.ts:14` sets
  `passWithNoTests: true`, so a broken include pattern would pass silently.
- Fix: A11.

### F15. API responses lack nosniff

P3. Verified against production.

- Evidence: `public/_headers` covers static assets only. On 2026-10-30, production
  `GET /api/catalog` returned only `Content-Type` and `Cache-Control`. `jsonResponse` sets nothing
  else (`src/worker/http.ts:15-21`).
- Fix: A12.

### F16. Polish

P3.

- No favicon. `public/` holds only `_headers`, and production `/favicon.ico` returns `200 text/html`
  through the single-page-app fallback. Verified.
- `document.title` is generic on game pages (`src/ui/App.tsx:121-123`). Verified.
- The number and date formatters repeat in `src/ui/catalog-page.tsx:15-17`,
  `src/ui/game-detail-page.tsx:10-19`, and `src/ui/offline-notice.tsx:7-10`. Verified.
- `scripts/create-production-wrangler-config.mjs` and `scripts/verify-production-d1.mjs` exist only
  to re-export `.mts` modules. `allowImportingTsExtensions`, which works with the existing `noEmit`
  (`tsconfig.json:8`), would allow direct imports. Observed.
- `tests/repository-contract.test.ts:128-222` asserts CONTRIBUTING phrases such as "Time Travel
  bookmark", so doc edits need test edits. It is the most-changed file in the last six months (7 of
  12 commits). Verified.
- The remote branches `chore/remove-surnex-source-urls` (its last fix is already on `main`) and
  `technology/toolchain` (no commits ahead of `main`) are stale. Verified.
- The README does not say that Steam sign-in is live, and still lists Steam profiles as V2
  (`README.md:21`, `:30`). Verified.

## Scorecard

| Dimension       | Grade    | Reason                                                                                                                                                         |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRY             | Adequate | Application code is clean. Release tooling copies the authority dataset (F3), and the gate list exists in four drifted copies (F4).                            |
| SOLID           | Strong   | Small single-purpose modules. Auth and repositories take injected fetch, clock, and logger seams. One misplaced helper module (F12).                           |
| KISS and YAGNI  | Adequate | Alias exports and option aliases across six auth modules (F10), and `.mjs` shims (F16).                                                                        |
| Coupling        | Adequate | Runtime modules are loosely coupled. Each data release is a measured 19-file change (F3).                                                                      |
| Maintainability | Strong   | Strict TypeScript, type-aware lint, append-only score history enforced by triggers, consistent error shapes.                                                   |
| Tests           | Strong   | 374 tests, including real D1 in the Workers pool and a headless Chrome layout check. CI drift-checks generated artifacts. Coverage reporting is partial (F14). |
| Docs            | Adequate | A detailed release runbook. No local run guide (F7), drifted gate lists (F4), and a README that is silent on sign-in (F16).                                    |

## Verification run

Run on 2026-10-30 against `3dc01d2` with Node 24.4.1 and pnpm 10.34.5. CI uses Node 24.18.0, so CI
results take precedence. Each exit code below came from the gate process itself.

| Gate                         | Exit | Notes                                                    |
| ---------------------------- | ---- | -------------------------------------------------------- |
| `format:check`               | 0    |                                                          |
| `lint`                       | 0    |                                                          |
| `typecheck`                  | 0    |                                                          |
| `typecheck:worker`           | 0    |                                                          |
| `release:check`              | 0    |                                                          |
| `catalog:check`              | 0    |                                                          |
| `mimma-seed:check`           | 0    |                                                          |
| `authoritative-record:check` | 0    |                                                          |
| `test:coverage`              | 0    | 30 files, 255 tests; 69.87% statements (Node suite only) |
| `test:worker`                | 0    | 13 files, 119 tests                                      |
| `build`                      | 0    | 215.48 kB JS (67.36 kB gzip), 9.38 kB CSS                |

Other checks:

- `corepack pnpm node scripts/create-production-wrangler-config.mts` with no D1 ID set exits 1 with
  "A real production D1 database ID is required." and writes no file, as CONTRIBUTING describes.
- Local app: after `wrangler d1 migrations apply NEED_GAMES_DB --local` and `corepack pnpm dev`,
  `/api/catalog` returned the 10 games and `/api/session` returned a signed-out session with sign-in
  disabled.
- GitHub on 2026-10-30: open PRs #23 (green), #24 (green), and #25 (Tests failing); no open issues.

## Intentional choices, not findings

- `src/worker/router.ts:129-133` drops the error message on purpose.
  `tests/worker/error-handling.test.ts:63` asserts that the message never reaches the logs. If 503s
  become hard to diagnose, log a classified error kind, never the message.
- The owner-run release controls (sentinel D1 IDs, rollback baseline, smoke checks) are owner
  requirements in `CONTRIBUTING.md:87-207`.
- `tests/ui/visual-layout.test.tsx` fails instead of skipping when Chrome is missing (`:86`).

## Not audited

- Read in full: `src/shared/`, `src/worker/router.ts`, `src/worker/http.ts`, `src/worker/routes/`,
  `src/worker/repositories/games.ts`, `catalog-release.ts`, `authoritative-scores.ts`,
  `src/worker/auth/session-cookie.ts`, `token-hash.ts`, the UI pages and `App.tsx`, the configs, CI,
  README, CONTRIBUTING, migrations 0001 and 0004, and the schema sections of 0003 and 0005.
- Sampled: `src/worker/auth/steam-openid.ts` (options, replay guard, validation entry point),
  `steam-profile.ts` (key handling, aliases), `src/worker/repositories/identity.ts` (exports and
  queries), `src/ui/auth/`, the release and verifier scripts (constants, smoke checks,
  expectations), the generators (paths), and the tests cited above.
- Not covered: `styles.css` and visual design, accessibility beyond markup, performance, the 0005
  trigger semantics in depth, the Steam OpenID field validators (`steam-openid.ts:60-460`),
  Cloudflare account settings, D1 plan limits, and backups. No code-intel index was used.
