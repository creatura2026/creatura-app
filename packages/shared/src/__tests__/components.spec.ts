import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ProgressBar from '../ui/ProgressBar.vue'
import RarityGems from '../ui/RarityGems.vue'
import TradeStatusBadge from '../ui/TradeStatusBadge.vue'

describe('losanges de rareté (RarityGems)', () => {
  const filled = (code: string) => {
    const wrapper = mount(RarityGems, { props: { code, label: code } })
    // Une gemme remplie porte un reflet blanc ; une vide n'a que son contour.
    return { wrapper, count: wrapper.findAll('svg').filter((svg) => svg.findAll('path').length === 3).length }
  }

  it.each([
    ['COMMON', 1],
    ['UNCOMMON', 2],
    ['RARE', 3],
    ['LEGENDARY', 4],
  ])('%s : %i losange(s) rempli(s) sur 4', (code, expected) => {
    const { wrapper, count } = filled(code)
    expect(wrapper.findAll('svg')).toHaveLength(4)
    expect(count).toBe(expected)
  })

  it('annonce la rareté aux lecteurs d’écran', () => {
    const wrapper = mount(RarityGems, { props: { code: 'RARE', label: 'Rare' } })
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Rareté : Rare')
  })

  it('une rareté inconnue compte comme commune', () => {
    expect(filled('INCONNUE').count).toBe(1)
  })
})

describe('état d’un échange (TradeStatusBadge)', () => {
  it.each([
    ['PENDING', 'En attente'],
    ['ACCEPTED', 'Conclu'],
    ['REFUSED', 'Refusé'],
    ['CANCELLED', 'Annulé'],
    ['FAILED', 'Échoué'],
  ] as const)('%s s’affiche « %s »', (status, label) => {
    expect(mount(TradeStatusBadge, { props: { status } }).text()).toBe(label)
  })
})

describe('barre de progression (ProgressBar)', () => {
  const width = (value: number, max: number) =>
    (mount(ProgressBar, { props: { value, max, label: 'Progression' } }).find('[role="progressbar"] > div').element as HTMLElement)
      .style.width

  it('se remplit en proportion, sans dépasser 100 %', () => {
    expect(width(6, 12)).toBe('50%')
    expect(width(20, 12)).toBe('100%')
    expect(width(3, 0)).toBe('0%')
  })

  it('est une barre de progression accessible', () => {
    const bar = mount(ProgressBar, { props: { value: 6, max: 12, label: 'Collection' } })
    expect(bar.attributes()).toMatchObject({
      role: 'progressbar',
      'aria-valuenow': '6',
      'aria-valuemax': '12',
      'aria-label': 'Collection',
    })
  })
})
