import { formatDateTime } from './format.js'

interface OfflineNoticeProps {
  datasetVersion: string
  generatedAt: string
}

export function OfflineNotice({ datasetVersion, generatedAt }: OfflineNoticeProps) {
  const freshness = formatDateTime(generatedAt)

  return (
    <aside className="offline-notice" aria-label="Degraded catalog data notice">
      <strong className="stamp stamp--small">Saved data</strong>
      <span>
        The live catalog is unreachable, so this is dataset {datasetVersion}, generated {freshness}.
        Search and sorting use this saved snapshot.
      </span>
    </aside>
  )
}
