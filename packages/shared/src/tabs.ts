import { useId, type Ref } from 'vue'

/**
 * Motif « onglets » accessible (RGAA 7.1, ARIA Authoring Practices « Tabs ») :
 * - `role="tab"` reliés au panneau par `aria-controls`, panneau `role="tabpanel"` nommé par
 *   l'onglet actif (`aria-labelledby`) ;
 * - flèches gauche / droite (en boucle), Début et Fin pour passer d'un onglet à l'autre ;
 * - un seul onglet dans l'ordre de tabulation, l'onglet actif (« roving tabindex ») ;
 * - l'activation suit le focus : changer d'onglet au clavier l'affiche aussitôt.
 *
 * Un seul panneau, dont le contenu suit l'onglet actif : chaque onglet le contrôle.
 *
 * ```vue
 * <div v-bind="tabs.listProps" aria-label="…">
 *   <button v-for="t in TABS" :key="t.value" v-bind="tabs.tabProps(t.value)" @click="tab = t.value">
 * </div>
 * <div v-bind="tabs.panelProps()">…</div>
 * ```
 */
export function useTabs<T extends string>(selected: Ref<T>, values: () => readonly T[]) {
  const base = useId()
  const tabId = (value: T) => `${base}-tab-${value}`
  const panelId = `${base}-panel`

  function select(value: T, focus: boolean) {
    selected.value = value
    if (focus) document.getElementById(tabId(value))?.focus()
  }

  function onKeydown(event: KeyboardEvent) {
    const list = values()
    const n = list.length
    if (!n) return
    const current = Math.max(0, list.indexOf(selected.value))
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % n
        break
      case 'ArrowLeft':
        next = (current - 1 + n) % n
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = n - 1
        break
      default:
        return
    }
    event.preventDefault()
    select(list[next]!, true)
  }

  return {
    listProps: { role: 'tablist', onKeydown } as const,
    tabProps: (value: T) => {
      const active = selected.value === value
      return {
        id: tabId(value),
        type: 'button',
        role: 'tab',
        'aria-selected': active,
        'aria-controls': panelId,
        tabindex: active ? 0 : -1,
      } as const
    },
    panelProps: () =>
      ({
        id: panelId,
        role: 'tabpanel',
        'aria-labelledby': tabId(selected.value),
        tabindex: 0,
      }) as const,
  }
}
