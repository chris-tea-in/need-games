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
- Add authoritative MiMMa scores and similar-game discovery (first version live for eight games).
- Add verified Community MiMMa contributions.
- Add optional Steam-based personal profiles and personalized recommendations in V2. Steam sign-in is in place.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) to run the app locally and for the required checks.

## Status

Closed beta foundation. The roadmap may change as the project is tested and refined.
