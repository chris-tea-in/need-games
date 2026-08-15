import type { CatalogCard } from '../shared/catalog-contract.js'

export const catalogSortOptions = ['title', 'reviews'] as const

export type CatalogSort = (typeof catalogSortOptions)[number]

export function selectCatalogGames(
  games: readonly CatalogCard[],
  query: string,
  sort: CatalogSort,
): CatalogCard[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingGames = games.filter((game) => {
    if (normalizedQuery.length === 0) {
      return true
    }

    return `${game.title} ${game.tags.join(' ')}`.toLocaleLowerCase().includes(normalizedQuery)
  })

  return [...matchingGames].sort((left, right) => {
    if (sort === 'reviews' && right.review.count !== left.review.count) {
      return right.review.count - left.review.count
    }

    return left.title.localeCompare(right.title)
  })
}
