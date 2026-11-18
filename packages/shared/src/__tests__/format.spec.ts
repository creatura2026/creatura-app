import { describe, expect, it } from 'vitest'

import {
  addDays,
  formatDate,
  formatDateTime,
  formatDay,
  formatDuration,
  formatPercent,
  nextParisMidnight,
  parisToday,
} from '../format'

describe('dates à l’heure de Paris', () => {
  it('le jour change à minuit à Paris, pas à minuit UTC', () => {
    // 23 h 30 UTC le 17 novembre = 0 h 30 le 18 à Paris (heure d'hiver, UTC+1).
    expect(parisToday(new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-18')
    expect(parisToday(new Date('2026-11-17T22:59:00Z'))).toBe('2026-11-17')
  })

  it('suit l’heure d’été', () => {
    // 22 h 30 UTC le 15 juillet = 0 h 30 le 16 à Paris (UTC+2).
    expect(parisToday(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
  })

  it('ajoute des jours, fin de mois et d’année comprises', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('trouve le prochain minuit de Paris, en hiver comme en été', () => {
    expect(nextParisMidnight(new Date('2026-11-17T10:00:00Z'))).toBe('2026-11-17T23:00:00.000Z')
    expect(nextParisMidnight(new Date('2026-07-15T10:00:00Z'))).toBe('2026-07-15T22:00:00.000Z')
  })

  it('le jour du changement d’heure', () => {
    // Nuit du 28 au 29 mars 2026 : minuit le 29 à Paris est encore en heure d'hiver.
    expect(nextParisMidnight(new Date('2026-03-28T12:00:00Z'))).toBe('2026-03-28T23:00:00.000Z')
    // Le 29 au soir, Paris est en heure d'été : minuit le 30 = 22 h UTC.
    expect(nextParisMidnight(new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-29T22:00:00.000Z')
  })
})

describe('mise en forme', () => {
  it('écrit les dates en français', () => {
    expect(formatDate('2026-11-10T08:14:00Z')).toBe('10 novembre')
    expect(formatDateTime('2026-11-10T08:14:00Z')).toBe('10 nov., 09:14')
    expect(formatDay('2026-11-10')).toBe('10 nov.')
  })

  it('écrit une durée en heures et minutes, arrondie à la minute supérieure', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(61_000)).toBe('2 min')
    expect(formatDuration(3 * 3_600_000 + 12 * 60_000)).toBe('3 h 12 min')
    expect(formatDuration(3_600_000 + 5 * 60_000)).toBe('1 h 05 min')
    expect(formatDuration(-5_000)).toBe('0 min')
  })

  it('écrit un pourcentage à la française', () => {
    expect(formatPercent(64)).toBe('64 %')
    expect(formatPercent(12.345, 1).replace(/\s/g, ' ')).toBe('12,3 %')
  })
})
