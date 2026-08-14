import type { GameDetail } from '../shared/catalog-contract.js'

interface GameDetailPageProps {
  game: GameDetail
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

export function GameDetailPage({ game }: GameDetailPageProps) {
  return (
    <main className="detail-page">
      <a className="back-link" href="/">
        Back to catalog
      </a>
      <article className="dashboard-grid detail-layout">
        <header className="page-header game-identity">
          <p className="eyebrow">Steam App {game.steamAppId}</p>
          <h1>{game.title}</h1>
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

        <aside className="card unscored-panel" aria-labelledby="score-status-heading">
          <p className="eyebrow">Catalog status</p>
          <h2 id="score-status-heading">Score unavailable</h2>
          <p>
            This game has no authoritative MiMMa score in the closed beta. Scoring and similar-game
            features will appear only after source data is available.
          </p>
        </aside>
      </article>
    </main>
  )
}
