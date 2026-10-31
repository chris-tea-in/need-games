import type { ReactNode } from 'react'

import type { CatalogResponse } from '../shared/catalog-contract.js'
import { catalogSortOptions, selectCatalogGames, type CatalogSort } from './catalog-state.js'
import { formatCount } from './format.js'

interface CatalogPageProps {
  catalog: CatalogResponse
  authControl?: ReactNode
  onQueryChange: (query: string) => void
  onSortChange: (sort: CatalogSort) => void
  query: string
  sort: CatalogSort
}

export function CatalogPage({
  authControl,
  catalog,
  onQueryChange,
  onSortChange,
  query,
  sort,
}: CatalogPageProps) {
  const games = selectCatalogGames(catalog.games, query, sort)

  return (
    <main className="catalog-page">
      <header className="page-header">
        <div className="page-header-top">
          <div className="page-header-copy">
            <p className="eyebrow">Closed beta</p>
            <h1>Find your next game</h1>
          </div>
          {authControl}
        </div>
        <p>
          Browse the initial Need Games catalog. Open a game to see its MiMMa gameplay profile and
          the scored games closest to it. Steam review metadata is shown as catalog context.
        </p>
      </header>

      <form className="catalog-controls" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>Search games</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Title or tag"
          />
        </label>
        <label>
          <span>Sort catalog</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as CatalogSort)}
          >
            {catalogSortOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'title' ? 'Title' : 'Most reviewed'}
              </option>
            ))}
          </select>
        </label>
      </form>

      {games.length === 0 ? (
        <p className="empty-state">No games match this catalog view.</p>
      ) : (
        <section className="dashboard-grid catalog-grid" aria-label="Games">
          {games.map((game) => (
            <article className="card game-card" key={game.id}>
              <p className="badge review-category">{game.review.category}</p>
              <h2>
                <a href={`/games/${game.slug}`}>{game.title}</a>
              </h2>
              <p className="review-count">{formatCount(game.review.count)} reviews</p>
              <ul className="tag-list" aria-label={`${game.title} tags`}>
                {game.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
