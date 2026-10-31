import type { ReactNode } from 'react'

import type { GameDetail, SimilarGame } from '../shared/catalog-contract.js'
import { MimmaGraph } from './mimma-graph.js'

export type SimilarGamesView =
  { kind: 'loading' } | { kind: 'error' } | { games: readonly SimilarGame[]; kind: 'data' }

interface GameDetailPageProps {
  authControl?: ReactNode
  game: GameDetail
  /** Omit for unscored games; similar games need an authoritative score. */
  similarGames?: SimilarGamesView
}

function formatReviewCount(count: number): string {
  return new Intl.NumberFormat().format(count)
}

function formatFetchedAt(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function ScorePanel({ game }: { game: GameDetail }) {
  if (game.authoritativeScore === null) {
    return (
      <aside className="card unscored-panel" aria-labelledby="score-status-heading">
        <p className="eyebrow">MiMMa score</p>
        <h2 id="score-status-heading">Score unavailable</h2>
        <p>
          This game has no authoritative MiMMa score yet, so similar games are not available for it.
        </p>
      </aside>
    )
  }

  return (
    <aside className="card score-panel" aria-labelledby="score-status-heading">
      <p className="eyebrow">MiMMa score</p>
      <h2 id="score-status-heading">Gameplay profile</h2>
      <MimmaGraph score={game.authoritativeScore} />
      <p className="score-provenance">
        Owner-authoritative snapshot v{game.authoritativeScore.snapshotVersion}
      </p>
    </aside>
  )
}

function SimilarGamesSection({ view }: { view: SimilarGamesView }) {
  let content: ReactNode
  if (view.kind === 'loading') {
    content = <p role="status">Finding similar games…</p>
  } else if (view.kind === 'error') {
    content = <p>Similar games are unavailable right now.</p>
  } else if (view.games.length === 0) {
    content = <p>No other scored games are in the catalog yet.</p>
  } else {
    content = (
      <ol className="similar-games-list">
        {view.games.map((similar) => (
          <li key={similar.id}>
            <a href={`/games/${similar.slug}`}>{similar.title}</a>
            <span>
              Micro {similar.authoritativeScore.micro}, Meso {similar.authoritativeScore.meso},
              Macro {similar.authoritativeScore.macro}
            </span>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section className="card similar-games" aria-labelledby="similar-games-heading">
      <h2 id="similar-games-heading">Similar games</h2>
      <p className="similar-games-note">Closest MiMMa profiles first.</p>
      {content}
    </section>
  )
}

export function GameDetailPage({ authControl, game, similarGames }: GameDetailPageProps) {
  return (
    <main className="detail-page">
      <a className="back-link" href="/">
        Back to catalog
      </a>
      <article className="dashboard-grid detail-layout">
        <header className="page-header game-identity">
          <div className="page-header-top">
            <div className="page-header-copy">
              <p className="eyebrow">Steam App {game.steamAppId}</p>
              <h1>{game.title}</h1>
            </div>
            {authControl}
          </div>
          <ul className="tag-list" aria-label={`${game.title} tags`}>
            {game.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </header>

        <section className="card game-content" aria-labelledby="game-summary-heading">
          <p className="badge review-category">{game.review.category}</p>
          <p className="review-count">
            {formatReviewCount(game.review.count)} Steam reviews <span>· {game.review.scope}</span>
          </p>
          <h2 id="game-summary-heading">About this game</h2>
          <p className="game-description">{game.shortDescription}</p>
          <dl className="provenance-list">
            <div>
              <dt>Catalog source</dt>
              <dd>
                <a href={game.provenance.storePageUrl}>Steam store page</a>
              </dd>
            </div>
            <div>
              <dt>Steam metadata fetched</dt>
              <dd>{formatFetchedAt(game.provenance.fetchedAt)}</dd>
            </div>
          </dl>
        </section>

        <ScorePanel game={game} />

        {game.authoritativeScore !== null && similarGames !== undefined ? (
          <SimilarGamesSection view={similarGames} />
        ) : null}
      </article>
    </main>
  )
}
