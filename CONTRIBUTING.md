# Contributing to Need Games

All changes use short-lived branches, automated checks, and owner-reviewed pull requests. The
`main` branch must remain stable and is never the starting place for implementation edits.

## Branch workflow

Create one branch for one coherent change:

- `step/...` for an implementation-plan step
- `feat/...` for a focused feature
- `fix/...` for a defect correction
- `security/...` for a security-specific change

Open a pull request into `main` when the branch is ready. The repository owner reviews the diff
and is the only person who merges it. Use squash merging so the completed PR becomes one
meaningful commit on `main`; GitHub deletes the merged branch automatically.

## Local toolchain

The repository pins Node in `.node-version` and pnpm in `package.json`. Enable the declared pnpm
version through Corepack before installing dependencies:

```powershell
corepack install --global pnpm@10.34.5
pnpm --version
pnpm install --frozen-lockfile
```

The expected pnpm version is `10.34.5`. If Windows does not allow Corepack to create a global
shim in the Node installation directory, run the same commands through Corepack:

```powershell
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

Never edit `pnpm-lock.yaml` manually. Change dependencies through pnpm and commit the resulting
manifest and lockfile together.

## Required checks

Run the same commands locally that GitHub Actions runs on a pull request:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

- Prettier checks formatting.
- ESLint checks risky or inconsistent code patterns.
- TypeScript checks type compatibility.
- Vitest checks behavior and reports executed code paths.

GitHub Actions runs those responsibilities as `Quality`, `Typecheck`, `Tests`, and `Build`. The
aggregate `CI` check fails unless every required job succeeds, and a failed `CI` check blocks the
PR from merging.

## Full local verification

After Corepack enables pnpm `10.34.5` and dependencies are installed, run the reusable local gate:

```powershell
corepack pnpm check:local
```

The wrapper runs formatting, linting, TypeScript, coverage, a production build, Worker types,
local D1 migrations, and a bounded local Worker smoke test. It uses only local Worker and D1
state. It does not change Cloudflare resources.

## Pull-request review

Complete the pull-request template with the problem, changes, verification evidence, risks,
security implications, and rollback path. Resolve review conversations and rerun checks after
each substantive correction.

The closed beta has a production build, so the required `Build` job runs it on every pull request
and push to `main`.

Release is separate from local verification. The owner must explicitly approve creating a D1
database, binding it, applying remote migrations, or replacing the existing Worker. Deployment
credentials must never be added to the ordinary CI workflow.

## Owner-run production release boundary

Production release is an owner-run Wrangler operation. GitHub Actions is CI-only and never holds
Cloudflare credentials, a production D1 ID, or a production deployment workflow. Run the release
from the reviewed commit in an authenticated Wrangler session for the intended Cloudflare account:

```powershell
git rev-parse HEAD
git status --short
corepack pnpm exec wrangler whoami
$env:PRODUCTION_D1_DATABASE_ID = Read-Host 'Owner-confirmed need-games-production D1 ID'
$env:STEAM_SIGN_IN_ENABLED = 'false'
$env:PRODUCTION_ORIGIN = 'https://myplayprint.e9k.workers.dev'
corepack pnpm release:production
Remove-Item Env:PRODUCTION_D1_DATABASE_ID
Remove-Item Env:STEAM_SIGN_IN_ENABLED
Remove-Item Env:PRODUCTION_ORIGIN
```

The command requires a clean working tree, prints the exact reviewed commit, and creates an
ignored `.wrangler/production-release.lock` so two owner-run releases cannot overlap. The old
GitHub-only branch/ref and concurrency controls are intentionally non-applicable: release
authority is the owner’s reviewed commit and authenticated local session.
The known production origin is mandatory. A full release stops before local checks or upload when
`PRODUCTION_ORIGIN` is absent or different.

`release:production` runs the full local gate, checks tracked sentinel IDs, creates the ignored
`.wrangler.production.jsonc` from the transient `PRODUCTION_D1_DATABASE_ID`, and builds the
production Cloudflare environment with `CLOUDFLARE_ENV=production`,
`CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH=.wrangler.production.jsonc`, and
`CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`. It verifies the Vite-generated Worker output
configuration and fails closed unless its static asset directory is exactly `dist/client` and
contains no `.dev.vars`, `.env`, Worker output, or paths outside that directory. Wrangler then
deploys that generated output configuration, never the input config, without applying migrations.
The final generated config must contain the transient D1 ID and `STEAM_SIGN_IN_ENABLED=false`.
The release verifies the target D1 identity, catalog state, and exactly `0001_schema.sql` and
`0002_seed_beta_catalog.sql` in its migration history. A later migration blocks this Phase 1
release. A real D1 ID must never be committed, added to GitHub, or written to a release report.
The generated configuration is ignored and is the only release file that may contain the ID.

Before each upload, the release reads the current production deployment and stores a rollback
baseline under the ignored `.wrangler/production-release/` directory. Keep that file until the
new release is accepted. It contains the active version ID and traffic percentage needed for
`wrangler rollback` or a version deployment. The first production deployment has no recoverable
pre-deploy baseline because that evidence was not captured before its upload. This limitation
cannot be reconstructed. Each later release must capture its baseline or stop before deployment.

Before a release, retain the recoverable preview export and confirm the target database name and ID
with the owner. If preflight verification or upload fails, keep the database and recovery artifacts
intact; do not delete or recreate the target or retry edited SQL without a reviewed recovery decision.
Set `PRODUCTION_ORIGIN` to the exact stable origin
`https://myplayprint.e9k.workers.dev`. Then run the smoke-only follow-up. It does not redeploy or
rerun remote migrations:

```powershell
$env:PRODUCTION_ORIGIN = Read-Host 'Stable production HTTPS origin'
corepack pnpm release:production -- --smoke-only
Remove-Item Env:PRODUCTION_ORIGIN
```

This check rejects a different origin and cross-origin redirects. It then checks the read-only
catalog, detail, unknown-route, unscored-similarity, and anonymous-session responses. Never enable
Steam sign-in from this release path; that requires its later explicit production gate.
