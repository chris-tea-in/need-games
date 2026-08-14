interface OfflineNoticeProps {
  datasetVersion: string
  generatedAt: string
}

export function OfflineNotice({ datasetVersion, generatedAt }: OfflineNoticeProps) {
  const freshness = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(generatedAt))

  return (
    <aside className="offline-notice" aria-label="Degraded catalog data notice">
      <strong>Showing saved catalog data</strong>
      <span>
        Dataset {datasetVersion} was generated {freshness}. Search and sorting use this saved
        snapshot.
      </span>
    </aside>
  )
}
