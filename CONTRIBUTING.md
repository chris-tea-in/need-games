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
```

- Prettier checks formatting.
- ESLint checks risky or inconsistent code patterns.
- TypeScript checks type compatibility.
- Vitest checks behavior and reports executed code paths.

GitHub Actions runs those responsibilities as `Quality`, `Typecheck`, and `Tests`. The aggregate
`CI` check fails unless every required job succeeds, and a failed `CI` check blocks the PR from
merging.

## Pull-request review

Complete the pull-request template with the problem, changes, verification evidence, risks,
security implications, and rollback path. Resolve review conversations and rerun checks after
each substantive correction.

The application has no production artifact yet, so CI deliberately has no build job. Add a
required production-build check when application scaffolding introduces a real build command;
do not add a placeholder or no-op build.

Continuous deployment is a separate future workflow. Deployment credentials must never be added
to the ordinary CI workflow.
