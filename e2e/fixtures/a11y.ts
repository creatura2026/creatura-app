/**
 * Accessibilité : analyse axe-core de la page affichée, critères WCAG 2.1 A et AA.
 *
 * Seules les violations « graves » et « critiques » font échouer le test : ce sont celles qui
 * bloquent un utilisateur (contraste illisible, bouton sans nom, champ sans étiquette…).
 *
 * Défauts connus (KNOWN) : déjà relevés, à corriger dans l'application. Ils ne font pas échouer
 * le test mais sont notés dans le rapport Playwright (annotation « a11y connu »). Retirer une
 * règle de KNOWN une fois corrigée : elle redevient bloquante.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const BLOCKING = new Set(['serious', 'critical'])

/** Outils du serveur de développement (Vue DevTools), absents du site publié. */
const DEV_ONLY = ['#__vue-devtools-container__', '.panel-entry-btn']

const KNOWN: Record<string, string> = {
  // Surtitres (.eyebrow), textes atténués (text-ink/70, /75), heures des messages.
  'color-contrast': 'contrastes insuffisants sur les textes secondaires',
  // aria-label différent du texte visible : logo « CREATURA » nommé « Créatura, accueil »,
  // lien du profil nommé « Mon profil » qui affiche le pseudo, cartes cliquables de la salle.
  'label-content-name-mismatch': 'nom accessible différent du texte affiché (WCAG 2.5.3)',
}

export async function expectAccessible(page: Page, options: { exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  for (const selector of [...DEV_ONLY, ...(options.exclude ?? [])]) builder = builder.exclude(selector)
  const { violations } = await builder.analyze()

  const serious = violations.filter((v) => BLOCKING.has(v.impact ?? ''))
  const elements = (v: (typeof violations)[number]) =>
    v.nodes.slice(0, 5).map((n) => n.target.join(' '))

  for (const v of serious.filter((v) => v.id in KNOWN)) {
    test.info().annotations.push({
      type: 'a11y connu',
      description: `${v.id} (${KNOWN[v.id]}) : ${elements(v).join(', ')}`,
    })
  }

  const blocking = serious
    .filter((v) => !(v.id in KNOWN))
    .map((v) => ({ règle: v.id, gravité: v.impact, aide: v.help, éléments: elements(v) }))

  expect(blocking, `Violations d'accessibilité sur ${page.url()}`).toEqual([])
}
