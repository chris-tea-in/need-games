import type { ReactNode } from 'react'

import type { GameDetail, SimilarGame } from '../shared/catalog-contract.js'
import { BoxArt, HeroArt } from './box-art.js'
import { formatCount, formatDateTime } from './format.js'
import { MimmaGraph, ProfileStrip, profileSummary } from './mimma-graph.js'
import { Icon, SiteFooter, SiteHeader } from './site-chrome.js'

const REVIEW_SCOPE_LABELS: Readonly<Record<GameDetail['review']['scope'], string>> = {
  'All Reviews: English Reviews': 'English reviews, all time',
}

export type SimilarGamesView =
  { kind: 'loading' } | { kind: 'error' } | { games: readonly SimilarGame[]; kind: 'data' }

interface GameDetailPageProps {
  authControl?: ReactNode
  game: GameDetail
  /** Omit for unscored games; similar games need an authoritative score. */
  similarGames?: SimilarGamesView
}

function ScorePanel({ game }: { game: GameDetail }) {
  if (game.authoritativeScore === null) {
    return (
      <section className="spec-panel spec-panel--unscored" aria-labelledby="score-status-heading">
        <header className="spec-panel-header">
          <h2 id="score-status-heading">Score unavailable</h2>
          <span>MiMMa profile</span>
        </header>
        <div className="spec-panel-body">
          <p className="stamp">Not yet scored</p>
          <p>
            This game has no authoritative MiMMa score yet, so similar games are not available for
            it.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="spec-panel" aria-labelledby="score-status-heading">
      <header className="spec-panel-header">
        <h2 id="score-status-heading">Gameplay profile</h2>
        <span>MiMMa, 0 to 100</span>
      </header>
      <div className="spec-panel-body">
        <MimmaGraph score={game.authoritativeScore} size="expanded" />
      </div>
      <p className="spec-panel-footnote">
        Owner-authoritative snapshot v{game.authoritativeScore.snapshotVersion}
      </p>
    </section>
  )
}

function SimilarGamesSection({ game, view }: { game: GameDetail; view: SimilarGamesView }) {
  let content: ReactNode
  if (view.kind === 'loading') {
    content = (
      <p className="shelf-status" role="status">
        Finding similar games…
      </p>
    )
  } else if (view.kind === 'error') {
    content = <p className="shelf-status">Similar games are unavailable right now.</p>
  } else if (view.games.length === 0) {
    content = <p className="shelf-status">No other scored games are in the catalog yet.</p>
  } else {
    const reference = game.authoritativeScore ?? undefined
    content = (
      <ol className="shelf shelf--similar">
        {view.games.map((similar, index) => (
          <li className="game-card game-card--similar" key={similar.id}>
            <span className="similar-rank" aria-hidden="true">
              {index + 1}
            </span>
            <BoxArt steamAppId={similar.steamAppId} title={similar.title} />
            <ProfileStrip reference={reference} score={similar.authoritativeScore} />
            <h3>
              <a href={`/games/${similar.slug}`}>{similar.title}</a>
            </h3>
            <p className="similar-scores">{profileSummary(similar.authoritativeScore)}</p>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section className="similar-games" aria-labelledby="similar-games-heading">
      <header className="similar-games-header">
        <h2 id="similar-games-heading">Plays like {game.title}</h2>
        <p>
          Similar games, closest MiMMa profile first. The{' '}
          <span className="reference-mark">orange tick</span> on each strip is {game.title}.
        </p>
      </header>
      {content}
    </section>
  )
}

export function GameDetailPage({ authControl, game, similarGames }: GameDetailPageProps) {
  return (
    <>
      <SiteHeader authControl={authControl} />
      <main className="detail-page">
        <HeroArt steamAppId={game.steamAppId} />
        <article className="detail-layout">
          <div className="detail-box">
            <a className="back-link" href="/">
              <Icon name="arrow-left" />
              Back to catalog
            </a>
            <div className="detail-box-front">
              <BoxArt priority steamAppId={game.steamAppId} title={game.title} />
            </div>
            <a className="store-link" href={game.provenance.storePageUrl}>
              View on Steam
              <Icon name="arrow-up-right" />
            </a>
          </div>

          <div className="detail-main">
            <header className="game-identity">
              <h1>{game.title}</h1>
              <p className="review-count">
                <span className="review-category">{game.review.category}</span>{' '}
                <span>{formatCount(game.review.count)} Steam reviews</span>
              </p>
              <ul className="tag-list" aria-label={`${game.title} tags`}>
                {game.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </header>

            <section className="game-about" aria-labelledby="game-summary-heading">
              <h2 id="game-summary-heading" className="visually-hidden">
                About this game
              </h2>
              <p className="game-description">{game.shortDescription}</p>
            </section>

            <ScorePanel game={game} />
          </div>
        </article>

        {game.authoritativeScore !== null && similarGames !== undefined ? (
          <SimilarGamesSection game={game} view={similarGames} />
        ) : null}

        <dl className="fine-print">
          <div>
            <dt>Steam App</dt>
            <dd>{game.steamAppId}</dd>
          </div>
          <div>
            <dt>Catalog source</dt>
            <dd>
              <a href={game.provenance.storePageUrl}>Steam store page</a>
            </dd>
          </div>
          <div>
            <dt>Steam metadata fetched</dt>
            <dd>{formatDateTime(game.provenance.fetchedAt)}</dd>
          </div>
          <div>
            <dt>Reviews counted</dt>
            <dd>{REVIEW_SCOPE_LABELS[game.review.scope]}</dd>
          </div>
        </dl>
      </main>
      <SiteFooter />
    </>
  )
}
