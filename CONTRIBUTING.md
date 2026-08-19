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

## Production release boundary

Production release is a manual, owner-approved workflow from `refs/heads/main`. The protected
`production` environment supplies the Cloudflare credentials and production D1 ID; do not copy
those values into `wrangler.jsonc`, a tracked file, or a normal CI job. The workflow creates an
ignored `.wrangler.production.jsonc`, verifies the production database identity and catalog state,
applies migrations, and only then uploads the Worker. Deployments run serially and an active
deployment is never cancelled by a later dispatch.

Before a release, retain a recoverable preview export and confirm the target database name and ID
with the owner. If a migration or upload fails, keep the database and the recorded recovery
artifacts intact; do not delete or recreate the target or retry with edited SQL without a reviewed
recovery decision. A post-deploy smoke check is enabled once the production Worker URL is present
in the protected environment variables.
