import type { ReactNode } from 'react'

import type {
  AuthoritativeScoreSummary,
  CatalogCard,
  GameDetail,
} from '../../shared/catalog-contract.js'
import { MIMMA_AXES, type MimmaScore } from '../../shared/mimma.js'
import { rankSimilarGames } from '../../shared/similarity.js'
import type { SimilarGamesView } from '../game-detail-page.js'
import { catalogSnapshot } from '../generated/catalog-snapshot.js'
import { researchMimma } from '../generated/research-mimma.js'
import { AXIS_NAMES } from '../mimma-graph.js'
import type { ResearchGame, ResearchSetId } from './research-data.js'

/**
 * Local preview of the research score sets (docs/MIMMA_RESCORING_2026-10-31.md). App only calls
 * into this module behind import.meta.env.DEV, so production builds leave it out.
 */

export const RESEARCH_SETS: readonly ResearchSetId[] = ['claude', 'tags', 'reviews', 'all']
export const RESEARCH_STORAGE_KEY = 'need-games:research-scores'

const SET_NAMES: Readonly<Record<ResearchSetId, string>> = {
  all: 'All data',
  claude: 'Claude',
  reviews: 'Reviews',
  tags: 'Tags',
}

const SET_DESCRIPTIONS: Readonly<Record<ResearchSetId, string>> = {
  all: 'the median of every source (owner v1, Claude, tags, reviews, and surnex)',
  claude: "Claude's rubric scores",
  reviews: 'estimates from Steam reviews',
  tags: 'estimates from Steam user tags',
}

type ResearchStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export function isResearchSetId(value: string): value is ResearchSetId {
  return (RESEARCH_SETS as readonly string[]).includes(value)
}

/**
 * The set to preview. `?scores=<set>` picks one and remembers it, because links between pages are
 * plain page loads. `?scores=v1`, or any value that is not a set, returns to the owner's scores.
 * Without usable storage the choice lasts for the current page only.
 */
export function resolveResearchSet(
  search: string,
  storage: ResearchStorage | null,
): ResearchSetId | null {
  const requested = new URLSearchParams(search).get('scores')
  if (requested !== null) {
    const set = isResearchSetId(requested) ? requested : null
    try {
      if (set === null) storage?.removeItem(RESEARCH_STORAGE_KEY)
      else storage?.setItem(RESEARCH_STORAGE_KEY, set)
    } catch {
      // Storage is full or blocked; the choice still applies to this page.
    }
    return set
  }
  const stored = readStoredSet(storage)
  return stored !== null && isResearchSetId(stored) ? stored : null
}

function readStoredSet(storage: ResearchStorage | null): string | null {
  try {
    return storage?.getItem(RESEARCH_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

/** The set for this page load. Reading localStorage throws when the browser blocks storage. */
export function browserResearchSet(): ResearchSetId | null {
  let storage: ResearchStorage | null
  try {
    storage = 'localStorage' in window ? window.localStorage : null
  } catch {
    storage = null
  }
  const { search } = window.location
  return resolveResearchSet(typeof search === 'string' ? search : '', storage)
}

function researchGame(steamAppId: number): ResearchGame | undefined {
  return researchMimma.games.find((game) => game.steamAppId === steamAppId)
}

/** A research score shaped like an owner score. Snapshot version 0 marks that it has none. */
export function researchScore(
  steamAppId: number,
  set: ResearchSetId,
): AuthoritativeScoreSummary | null {
  const game = researchGame(steamAppId)
  if (game === undefined) return null
  const micro = game.micro[set]
  const meso = game.meso[set]
  const macro = game.macro[set]
  if (micro === null || meso === null || macro === null) return null
  return { macro, meso, micro, snapshotVersion: 0 }
}

/** Shelf strip scores for the catalog, keyed by catalog game ID. */
export function researchCatalogScores(
  games: readonly CatalogCard[],
  set: ResearchSetId,
): Map<string, MimmaScore> {
  const scores = new Map<string, MimmaScore>()
  for (const game of games) {
    const score = researchScore(game.steamAppId, set)
    if (score !== null) scores.set(game.id, score)
  }
  return scores
}

/** Similar games ranked from the research set, with the same rules the Worker uses for v1. */
export function researchSimilarGames(game: GameDetail, set: ResearchSetId): SimilarGamesView {
  const selected = researchScore(game.steamAppId, set)
  if (selected === null) return { games: [], kind: 'data' }

  const candidates = catalogSnapshot.games.flatMap((candidate) => {
    const score = candidate.id === game.id ? null : researchScore(candidate.steamAppId, set)
    return score === null
      ? []
      : [
          {
            authoritativeScore: score,
            id: candidate.id,
            score,
            slug: candidate.slug,
            steamAppId: candidate.steamAppId,
            tags: candidate.tags,
            title: candidate.title,
          },
        ]
  })
  const games = rankSimilarGames({ score: selected, tags: game.tags }, candidates).map(
    ({ authoritativeScore, distance, id, sharedTags, slug, steamAppId, title }) => ({
      authoritativeScore,
      distance,
      id,
      sharedTags,
      slug,
      steamAppId,
      title,
    }),
  )
  return { games, kind: 'data' }
}

export function ResearchBanner({ active }: { active: ResearchSetId }) {
  return (
    <aside aria-label="Research score preview" className="research-banner">
      <p>
        <span className="research-banner-label">Research preview</span> Scores on this page are{' '}
        {SET_DESCRIPTIONS[active]}, not the owner&apos;s scores. Local development only.
      </p>
      <nav aria-label="Score set" className="research-banner-sets">
        <a href="?scores=v1">Owner v1</a>
        {RESEARCH_SETS.map((set) => (
          <a aria-current={set === active ? 'true' : undefined} href={`?scores=${set}`} key={set}>
            {SET_NAMES[set]}
          </a>
        ))}
      </nav>
    </aside>
  )
}

function ownerSummary(game: ResearchGame): string {
  const { micro, meso, macro } = {
    macro: game.macro.owner,
    meso: game.meso.owner,
    micro: game.micro.owner,
  }
  return micro === null || meso === null || macro === null
    ? 'The owner has not scored this game.'
    : `Owner v1: Micro ${micro}, Meso ${meso}, Macro ${macro}.`
}

/** The spec panel footnote in research mode: which set this is, and the owner's v1 for scale. */
export function researchScoreNote(steamAppId: number, set: ResearchSetId): string | null {
  const game = researchGame(steamAppId)
  if (game === undefined) return null
  const parts = [`Research preview: ${SET_DESCRIPTIONS[set]}, ${researchMimma.collectedOn}.`]
  if (set === 'tags' && game.micro.tagsLowConfidence) {
    parts.push("Low confidence: one of this game's top tags has too little reference data.")
  }
  if (set === 'reviews') {
    const ranges = MIMMA_AXES.flatMap((axis) => {
      const range = game[axis].reviewsRange
      return range === null ? [] : [`${AXIS_NAMES[axis]} ${range[0]} to ${range[1]}`]
    })
    if (ranges.length > 0) parts.push(`80% ranges: ${ranges.join(', ')}.`)
  }
  if (set !== 'all') parts.push(ownerSummary(game))
  return parts.join(' ')
}

function sourceValue(value: number | null, suffix = ''): string {
  return value === null ? 'none' : `${value}${suffix}`
}

/** Every source per axis, shown under the profile in the "all data" set. */
export function ResearchSources({ steamAppId }: { steamAppId: number }) {
  const game = researchGame(steamAppId)
  if (game === undefined) return null
  const lowConfidence = game.micro.tagsLowConfidence

  return (
    <div className="research-sources">
      <table>
        <caption>Every source. The strips and similar games use the median.</caption>
        <thead>
          <tr>
            <th scope="col">Axis</th>
            <th scope="col">Median</th>
            <th scope="col">Owner v1</th>
            <th scope="col">Claude</th>
            <th scope="col">Tags</th>
            <th scope="col">Reviews</th>
            <th scope="col">surnex</th>
          </tr>
        </thead>
        <tbody>
          {MIMMA_AXES.map((axis) => {
            const sources = game[axis]
            const range = sources.reviewsRange
            return (
              <tr key={axis}>
                <th scope="row">{AXIS_NAMES[axis]}</th>
                <td className="research-sources-median">{sources.all}</td>
                <td>{sourceValue(sources.owner)}</td>
                <td>{sources.claude}</td>
                <td>{sourceValue(sources.tags, lowConfidence ? ' (low)' : '')}</td>
                <td>
                  {sourceValue(
                    sources.reviews,
                    range === null ? '' : ` (${range[0]} to ${range[1]})`,
                  )}
                </td>
                <td>{sourceValue(sources.surnex)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p>
        Reviews show an 80% range.
        {lowConfidence ? ' "(low)" marks a low-confidence tag estimate.' : ''}
      </p>
    </div>
  )
}

export interface ResearchDetailView {
  game: GameDetail
  scoreDetails: ReactNode
  scoreFootnote: string | null
  similarGames: SimilarGamesView
}

/** The game page with a research set in place of the owner's score. */
export function researchDetailView(game: GameDetail, set: ResearchSetId): ResearchDetailView {
  return {
    game: { ...game, authoritativeScore: researchScore(game.steamAppId, set) },
    scoreDetails: set === 'all' ? <ResearchSources steamAppId={game.steamAppId} /> : null,
    scoreFootnote: researchScoreNote(game.steamAppId, set),
    similarGames: researchSimilarGames(game, set),
  }
}
