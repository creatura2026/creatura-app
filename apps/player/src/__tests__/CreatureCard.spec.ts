import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

const moussou = CREATURES.find((c) => c.name === 'Moussou')!

describe('CreatureCard', () => {
  it('affiche la créature, sa famille, sa rareté et la quantité possédée', () => {
    const wrapper = mount(CreatureCard, { props: { creature: moussou, quantity: 3 } })
    expect(wrapper.text()).toContain('Moussou')
    expect(wrapper.text()).toContain('Nature · Commun')
    expect(wrapper.text()).toContain('Possédées : 3')
    expect(wrapper.find('img').attributes('alt')).toBe('Illustration de Moussou')
  })

  it('affiche une carte manquante sans illustration', () => {
    const wrapper = mount(CreatureCard, { props: { creature: moussou, missing: true } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Non possédée')
    expect(wrapper.attributes('aria-label')).toBe('Moussou, non possédée')
  })
})
