import type { MimmaAxis } from '../../shared/mimma.js'

/**
 * Research score sets from docs/MIMMA_RESCORING_2026-10-31.md, for the local preview only. None of
 * these values are owner-authoritative.
 */

export type ResearchSetId = 'claude' | 'tags' | 'reviews' | 'all'

export interface ResearchAxisSources {
  readonly owner: number | null
  readonly claude: number
  readonly tags: number | null
  /** One of the game's five most-voted tags appears on fewer than 3 reference games. */
  readonly tagsLowConfidence: boolean
  readonly reviews: number | null
  /** 80% bootstrap range of the review estimate. */
  readonly reviewsRange: readonly [number, number] | null
  readonly surnex: number | null
  /** Median of every source above that has a value, rounded half up. */
  readonly all: number
}

export type ResearchGame = { readonly steamAppId: number } & Readonly<
  Record<MimmaAxis, ResearchAxisSources>
>

export interface ResearchMimmaData {
  readonly collectedOn: string
  readonly games: readonly ResearchGame[]
}
