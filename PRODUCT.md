# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PC players who already love a game and want their next one to play the same way. They arrive with a
title in mind, look up its MiMMa profile, and follow the closest matches.

## Product Purpose

Need Games finds games by how they play. Each scored game gets a MiMMa profile, and the site ranks
the other scored games by how close their profiles are. Success means a player leaves with a game
they had not considered that plays the way they wanted.

## Positioning

MiMMa scores gameplay on three independent axes, each 0 to 100:

- Micro: execution, reflexes, timing, and precision.
- Meso: uncertainty, hidden information, and mind games.
- Macro: strategy, systems, optimization, and resource management.

A game can be high on several axes at once. Similarity comes from the profile, not from genre tags
or store popularity, so a match can cross genres.

## Operating Context

- Closed beta: a read-only catalog of 10 curated Steam games.
- Two routes: the catalog (search by title or tag, sort by title or review count) and a game page
  (Steam metadata, MiMMa profile, five closest scored games).
- Steam sign-in exists and unlocks nothing yet.
- A bundled snapshot keeps browsing and similar games working when the API is down; the UI labels
  that degraded state with the dataset version and freshness.

## Capabilities and Constraints

- Stack: React 19 + Vite, served by a Cloudflare Worker. Plain CSS in `src/ui/styles.css`.
- Strict CSP in `public/_headers`. Fonts and scripts must be self-hosted. Steam's image CDN is
  allowed for game art (user decision, 2026-10-31).
- All 10 games have an owner-authoritative score from snapshot v2 (2026-10-31). A game without a
  score must still say so and gets no similar games, so the unscored state stays in the UI.
- MiMMa labels: Absent (0), Slight (<30), Low (<50), Moderate (<70), High (<90), Defining (90+).

## Brand Commitments

- Name: Need Games. MiMMa is always written with that capitalization.
- UI copy may be rewritten freely, but data, provenance notes, and factual claims stay true.

## Evidence on Hand

- `src/ui/generated/catalog-snapshot.ts`: titles, Steam app IDs, tags, review category and count,
  short descriptions, scores, provenance timestamps.
- Steam header and capsule art by app ID (external, via Steam CDN).
- No testimonials, user counts, or press. Do not invent any.

## Product Principles

1. The profile is the product. MiMMa data leads every screen it appears on.
2. Show why two games match, not only that they do.
3. Be honest about gaps: unscored games, offline data, and beta scope are stated plainly.
4. Steam metadata is context, never the headline.

## Accessibility & Inclusion

Keyboard and screen reader support already exist (meters with aria values, focus-trapped dialog,
reduced-motion handling). Keep them. Target WCAG 2.2 AA contrast.
