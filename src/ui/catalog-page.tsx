import type { ReactNode } from 'react'

import type { CatalogResponse } from '../shared/catalog-contract.js'
import { MIMMA_AXES, type MimmaScore } from '../shared/mimma.js'
import { BoxArt } from './box-art.js'
import { catalogSortOptions, selectCatalogGames, type CatalogSort } from './catalog-state.js'
import { formatCount } from './format.js'
import { AXIS_DESCRIPTIONS, AXIS_NAMES, ProfileStrip, profileSummary } from './mimma-graph.js'
import { Icon, SiteFooter, SiteHeader } from './site-chrome.js'

interface CatalogPageProps {
  catalog: CatalogResponse
  authControl?: ReactNode
  onQueryChange: (query: string) => void
  onSortChange: (sort: CatalogSort) => void
  query: string
  /** Authoritative scores by game ID, when they are known to match this catalog release. */
  scores?: ReadonlyMap<string, MimmaScore>
  sort: CatalogSort
}

const SORT_LABELS: Readonly<Record<CatalogSort, string>> = {
  reviews: 'Most reviewed',
  title: 'Title, A to Z',
}

function StripKey() {
  return (
    <aside className="strip-key" aria-labelledby="strip-key-heading">
      <h2 id="strip-key-heading">Reading a MiMMa strip</h2>
      <p>Three inks, each scored 0 to 100. A game can max out more than one.</p>
      <dl>
        {MIMMA_AXES.map((axis) => (
          <div className={`strip-key-row strip-key-row--${axis}`} key={axis}>
            <dt>{AXIS_NAMES[axis]}</dt>
            <dd>{AXIS_DESCRIPTIONS[axis]}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

export function CatalogPage({
  authControl,
  catalog,
  onQueryChange,
  onSortChange,
  query,
  scores,
  sort,
}: CatalogPageProps) {
  const games = selectCatalogGames(catalog.games, query, sort)
  const trimmedQuery = query.trim()

  return (
    <>
      <SiteHeader authControl={authControl} />
      <main className="catalog-page">
        <header className="catalog-intro">
          <div className="catalog-intro-copy">
            <h1>Find your next game by how it plays.</h1>
            <p>
              Every scored game gets a MiMMa profile across three kinds of gameplay. Open a box to
              see its full profile and the scored games that play closest to it.
            </p>
            <p className="beta-sticker">
              <span>Closed beta</span>
              <strong>{catalog.games.length} games</strong>
            </p>
          </div>
          <StripKey />
        </header>

        <form
          className="catalog-controls"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <label className="search-field">
            <span>Search games</span>
            <span className="search-input">
              <Icon name="search" />
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Title or tag, like Survival"
              />
            </span>
          </label>
          <label className="sort-field">
            <span>Sort catalog</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as CatalogSort)}
            >
              {catalogSortOptions.map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <p className="result-count" aria-live="polite">
            {games.length === catalog.games.length
              ? `${games.length} games on the shelf`
              : `${games.length} of ${catalog.games.length} games`}
          </p>
        </form>

        {games.length === 0 ? (
          <p className="empty-state">
            {trimmedQuery.length === 0
              ? 'No games match this catalog view.'
              : `No games match "${trimmedQuery}". Try a tag such as FPS or Survival.`}
          </p>
        ) : (
          <section className="shelf" aria-label="Games">
            {games.map((game, index) => {
              const score = scores?.get(game.id)

              return (
                <article className="game-card" key={game.id}>
                  <BoxArt priority={index < 5} steamAppId={game.steamAppId} title={game.title} />
                  {score === undefined ? (
                    scores === undefined ? null : (
                      <p className="stamp stamp--small">Not yet scored</p>
                    )
                  ) : (
                    <>
                      <ProfileStrip score={score} />
                      <p className="visually-hidden">{profileSummary(score)}</p>
                    </>
                  )}
                  <h2>
                    <a href={`/games/${game.slug}`}>{game.title}</a>
                  </h2>
                  <p className="review-count">
                    <span className="review-category">{game.review.category}</span>{' '}
                    <span>{formatCount(game.review.count)} reviews</span>
                  </p>
                  <ul className="tag-list" aria-label={`${game.title} tags`}>
                    {game.tags.slice(0, 3).map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
