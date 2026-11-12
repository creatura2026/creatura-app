/**
 * Couleur associée à chaque rareté (voir l'aura `.rarity-frame` dans theme.css).
 * Gris = commun, bleu = peu commun, or = rare : la convention des jeux de cartes.
 */
export const RARITY_COLORS: Record<string, { color: string; name: string }> = {
  COMMON: { color: 'var(--color-rarity-common)', name: 'gris' },
  UNCOMMON: { color: 'var(--color-rarity-uncommon)', name: 'bleu' },
  RARE: { color: 'var(--color-rarity-rare)', name: 'or' },
}

export function rarityColor(code: string): string {
  return RARITY_COLORS[code]?.color ?? 'var(--color-line)'
}
