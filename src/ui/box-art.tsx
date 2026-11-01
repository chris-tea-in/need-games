import { useState } from 'react'

const STEAM_ASSET_ORIGIN = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps'

export type SteamArt = 'capsule' | 'hero'

const ART_FILES: Readonly<Record<SteamArt, string>> = {
  capsule: 'library_600x900.jpg',
  hero: 'library_hero.jpg',
}

export function steamArtUrl(steamAppId: number, art: SteamArt): string {
  return `${STEAM_ASSET_ORIGIN}/${steamAppId}/${ART_FILES[art]}`
}

interface BoxArtProps {
  steamAppId: number
  title: string
  priority?: boolean
}

/**
 * The front of a game box. Steam's portrait library capsule when it loads, and a printed
 * title card when it does not, so a missing image never leaves an empty box on the shelf.
 */
export function BoxArt({ priority = false, steamAppId, title }: BoxArtProps) {
  const [failed, setFailed] = useState(false)

  return (
    <span className="box-art">
      <span className="box-art-body">
        <span aria-hidden="true" className="box-art-spine" />
        {failed ? (
          <span aria-hidden="true" className="box-art-fallback">
            <span className="box-art-fallback-title">{title}</span>
          </span>
        ) : (
          <img
            alt=""
            decoding="async"
            height={900}
            loading={priority ? 'eager' : 'lazy'}
            onError={() => setFailed(true)}
            src={steamArtUrl(steamAppId, 'capsule')}
            width={600}
          />
        )}
      </span>
    </span>
  )
}

export function HeroArt({ steamAppId }: { steamAppId: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div aria-hidden="true" className="hero-art hero-art--empty" />

  return (
    <div aria-hidden="true" className="hero-art">
      <img
        alt=""
        decoding="async"
        height={620}
        onError={() => setFailed(true)}
        src={steamArtUrl(steamAppId, 'hero')}
        width={1920}
      />
    </div>
  )
}
