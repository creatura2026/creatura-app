/**
 * Teinte associée à chaque famille de créatures : fond de la fenêtre d'illustration des cartes.
 * Ce sont les couleurs pastel du document de vision ; une famille inconnue prend le gris brume.
 */
export const FAMILY_TINTS: Record<string, string> = {
  NATURE: 'var(--color-mint)',
  CRISTAL: 'var(--color-butter)',
  BRUME: 'var(--color-sky)',
  LUEUR: 'var(--color-salmon)',
}

export function familyTint(code: string): string {
  return FAMILY_TINTS[code] ?? 'var(--color-mist)'
}
