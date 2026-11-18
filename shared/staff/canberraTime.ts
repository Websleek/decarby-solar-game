const CANBERRA = 'Australia/Canberra'

/** Format an ISO/timestamptz string for staff UI in Australia/Canberra. */
export function formatCanberraDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: CANBERRA,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date)
}

export function redeemedMessageCanberra(iso: string | null | undefined): string {
  const when = formatCanberraDateTime(iso)
  if (when === '—') return 'This code has been redeemed.'
  return `This code has been redeemed on ${when}.`
}
