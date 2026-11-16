const TZ = 'Europe/Paris'

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: TZ })
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
})
const shortDayFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** « 10 novembre » */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

/** « 10 nov., 08:14 » */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

/** Pour un jour `YYYY-MM-DD` : « 10 nov. » */
export function formatDay(day: string): string {
  return shortDayFmt.format(new Date(`${day}T00:00:00Z`))
}

/** Jour courant au sens du fuseau Europe/Paris, au format `YYYY-MM-DD`. */
export function parisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)
}

/** Ajoute `n` jours à un jour `YYYY-MM-DD`. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Prochain minuit, heure de Paris, en ISO UTC. */
export function nextParisMidnight(now: Date = new Date()): string {
  const tomorrow = addDays(parisToday(now), 1)
  // On cherche l'instant UTC dont la date parisienne passe à `tomorrow`.
  for (const offset of [-1, -2, 0, -3, 1]) {
    const candidate = new Date(`${tomorrow}T00:00:00Z`)
    candidate.setUTCHours(candidate.getUTCHours() + offset)
    const before = new Date(candidate.getTime() - 1)
    if (parisToday(candidate) === tomorrow && parisToday(before) !== tomorrow) {
      return candidate.toISOString()
    }
  }
  return new Date(`${tomorrow}T00:00:00Z`).toISOString()
}

/** « 3 h 12 min » ou « 12 min » */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`
}
