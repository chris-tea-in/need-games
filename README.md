# Need Games

Need Games is a game discovery project that uses MiMMa profiles to explain how games play and, later, help players find similar games.

## What is a MiMMa score?

A MiMMa score is a three-part gameplay profile:

- Micro: execution, reflexes, timing, and precision.
- Meso: uncertainty, hidden information, and mind games.
- Macro: strategy, systems, optimization, and resource management.

Each category receives its own score from 0% to 100%. The scores measure how strongly a game uses that type of gameplay.

A game can be high in multiple categories. For example, a game can have 100% Micro gameplay while also having 50% Macro gameplay.

This makes MiMMa useful for finding games with overlapping gameplay traits, such as games that require both strong execution and deep strategy.

## Closed beta

The current closed beta is a read-only catalog of ten curated Steam games. You can browse, search, sort, and inspect source metadata. All ten games have an owner-authoritative MiMMa score from snapshot v2: their pages show the gameplay profile and up to five scored games with a close profile, ordered by MiMMa distance and shared Steam tags. Each v2 score is the median of the sources compared in `docs/MIMMA_RESCORING_2026-10-31.md`.

Signing in with Steam is available. It does not unlock any features yet.

The application bundles a reviewed catalog snapshot, including the scores. It keeps browsing and similar-game results available when the same-origin catalog API is temporarily unavailable, and labels that degraded state with its dataset version and freshness.

## Roadmap

- Build a curated, review-gated game catalog.
- Add authoritative MiMMa scores and similar-game discovery (live for all ten games since owner snapshot v2).
- Add verified Community MiMMa contributions.
- Add optional Steam-based personal profiles and personalized recommendations in V2. Steam sign-in is in place.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) to run the app locally and for the required checks.

## Project history

[docs/DECISION_LOG.md](docs/DECISION_LOG.md) walks through every change on the `feat/backlog-next-steps` branch: the decisions, who made them, how each change was checked, and what to learn from it. Start there if you are catching up on the redesign, the MiMMa research, or owner snapshot v2.

## Scripts

Run every command from the repository root with Node 24 (see `.node-version`). Install dependencies once with `corepack pnpm install --frozen-lockfile`.

### Everyday development

| Command                          | What it does                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm dev`              | Starts the app and the Worker at `http://localhost:5173/`. Apply local migrations first (below).                                  |
| `corepack pnpm check:local`      | Runs the full gate: format, lint, types, generated-data checks, tests, build, and a local smoke test. Run it before every commit. |
| `corepack pnpm test`             | Runs the Node test suite.                                                                                                         |
| `corepack pnpm test:node`        | Same as `test`, with the Node config named explicitly.                                                                            |
| `corepack pnpm test:worker`      | Runs the Worker and D1 tests in the Workers runtime.                                                                              |
| `corepack pnpm test:coverage`    | Runs the Node tests with a coverage report in `coverage/`.                                                                        |
| `corepack pnpm typecheck`        | Type-checks the app, scripts, and tests.                                                                                          |
| `corepack pnpm typecheck:worker` | Checks that the generated Worker types match `wrangler.jsonc` (`scripts/check-worker-types.mjs`).                                 |
| `corepack pnpm lint`             | Runs ESLint with zero warnings allowed.                                                                                           |
| `corepack pnpm format`           | Formats every file with Prettier.                                                                                                 |
| `corepack pnpm format:check`     | Reports files Prettier would change.                                                                                              |
| `corepack pnpm build`            | Builds the production client and Worker into `dist/`.                                                                             |

The local database needs the migrations once, and again after you pull new ones:

```sh
corepack pnpm exec wrangler d1 migrations apply NEED_GAMES_DB --local
```

While the dev server runs, add `?scores=claude`, `?scores=tags`, `?scores=reviews`, or `?scores=all` to any local URL to preview the research score sets. `?scores=owner` returns to the owner's scores. Production builds leave the preview out.

### Generated data

These scripts keep committed artifacts in step with their sources. Without a flag, each one checks for drift and fails if the committed file is out of date. `check:local` runs the checks.

| Command                                                          | Source and output                                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm catalog:check`                                    | Checks `migrations/0002_seed_beta_catalog.sql` and `src/ui/generated/catalog-snapshot.ts` against `data/catalog-release-v1.json` and the latest owner snapshot. |
| `node scripts/generate-catalog-artifacts.mts --write`            | Regenerates those two files.                                                                                                                                    |
| `node scripts/validate-catalog-release.mts`                      | Validates `data/catalog-release-v1.json` on its own.                                                                                                            |
| `corepack pnpm authoritative-record:check`                       | Checks migrations 0005 and 0007 against the hash-pinned owner records in `data/authoritative-records/`.                                                         |
| `node scripts/generate-owner-authoritative-mimma.mts --write`    | Regenerates migration 0005 from the v1 record. It should never need to change.                                                                                  |
| `node scripts/generate-owner-authoritative-mimma-v2.mts --write` | Regenerates migration 0007 from the v2 record.                                                                                                                  |

### MiMMa research

These scripts reproduce `docs/MIMMA_RESCORING_2026-10-31.md`. They call Steam's public APIs, need no key, and write downloads to `.cache/community-mimma/`, which git ignores. Run them in order:

```sh
# 1. Only when data/surnex-dataset.csv changes. Review the manual rows before committing the output.
node scripts/research/resolve-surnex-steam-apps.mts --write

# 2. Downloads tag weights and the most helpful English reviews. Existing files are kept.
#    Add --refresh to download everything again.
node scripts/research/fetch-community-signals.mts --reviews 300

# 3. Prints the report tables. --write-ui also updates the local preview data
#    in src/ui/generated/research-mimma.ts.
node scripts/research/analyze-community-mimma.mts --write-ui
```

Steam's tags and reviews change over time, so a later run will not reproduce the report's numbers exactly.

### Production release (owner only)

Releases follow "Owner-run production release boundary" in [CONTRIBUTING.md](CONTRIBUTING.md). Read that section first; these commands touch the production database or deployment.

| Command                                                            | What it does                                                                                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm release:check`                                      | Confirms `wrangler.jsonc` holds only placeholder database IDs, so a real ID is never committed.                                                                               |
| `corepack pnpm node scripts/create-production-wrangler-config.mts` | Writes the ignored `.wrangler.production.jsonc` from the `PRODUCTION_D1_DATABASE_ID` environment variable. Needed before applying production migrations.                      |
| `corepack pnpm release:production`                                 | Runs the local gate, verifies the production database, builds, deploys, and smoke-tests. Needs `PRODUCTION_D1_DATABASE_ID`, `PRODUCTION_ORIGIN`, and `STEAM_SIGN_IN_ENABLED`. |
| `corepack pnpm release:production -- --smoke-only`                 | Repeats the read-only production smoke test without deploying. Needs `PRODUCTION_ORIGIN` and `STEAM_SIGN_IN_ENABLED`.                                                         |
| `corepack pnpm deploy`                                             | Plain `wrangler deploy` behind `release:check`. Use `release:production` for real releases.                                                                                   |

`scripts/verify-production-d1.mts` is the database verifier that `release:production` calls. It can also run alone on saved Wrangler output: `node scripts/verify-production-d1.mts --info-file <path> --state-file <path>`.

### Modules, not commands

`scripts/release-manifest.mts` (the list of migrations and pinned data files), `scripts/owner-authority-history.mts` (the append-only owner score history), and `scripts/research/community-mimma.mts` (shared research code) are imported by the scripts above and do nothing when run on their own.

## Status

Closed beta foundation. The roadmap may change as the project is tested and refined.
