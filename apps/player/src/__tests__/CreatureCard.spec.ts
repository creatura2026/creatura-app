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
    // Texte lu par un lecteur d'écran : sans le « × » des cartes étroites, masqué par aria-hidden.
    const footer = wrapper.find('p.mt-auto').element.cloneNode(true) as HTMLElement
    footer.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove())
    expect(footer.textContent?.trim()).toBe('Possédées : 3')
    expect(wrapper.find('img').attributes('alt')).toBe('Illustration de Moussou')
  })

  it('affiche une carte manquante en silhouette décorative', () => {
    const wrapper = mount(CreatureCard, { props: { creature: moussou, missing: true } })
    const img = wrapper.find('img')
    expect(img.classes()).toContain('card-silhouette')
    expect(img.attributes('alt')).toBe('')
    expect(wrapper.text()).toContain('Non possédée')
    expect(wrapper.attributes('aria-label')).toBe('Moussou, non possédée')
  })
})
