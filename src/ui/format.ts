export function formatCount(count: number): string {
  return new Intl.NumberFormat().format(count)
}

export function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}
