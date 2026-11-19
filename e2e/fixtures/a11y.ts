/**
 * Accessibilité : analyse axe-core de la page affichée, critères WCAG 2.1 A et AA.
 *
 * Les violations « graves » et « critiques » font échouer le test : ce sont celles qui bloquent un
 * utilisateur (contraste illisible, bouton sans nom, nom différent du texte affiché…). Aucune règle
 * n'est tolérée : un défaut se corrige dans l'application, pas ici.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const BLOCKING = new Set(['serious', 'critical'])

/** Outils du serveur de développement (Vue DevTools), absents du site publié. */
const DEV_ONLY = ['#__vue-devtools-container__', '.panel-entry-btn']

export async function expectAccessible(page: Page, options: { exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  for (const selector of [...DEV_ONLY, ...(options.exclude ?? [])]) builder = builder.exclude(selector)
  const { violations } = await builder.analyze()

  const blocking = violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .map((v) => ({
      règle: v.id,
      gravité: v.impact,
      aide: v.help,
      éléments: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }))

  expect(blocking, `Violations d'accessibilité sur ${page.url()}`).toEqual([])
}
