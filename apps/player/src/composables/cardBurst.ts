/**
 * Fait jaillir les cartes du sachet ouvert jusqu'à leur place dans la grille.
 *
 * Chaque carte part exactement de la position de son dos dessiné dans le canvas (passage de relais
 * invisible), remonte d'abord DERRIÈRE la face avant du sachet (z-index sous l'image du sachet),
 * passe devant une fois sortie, puis file vers sa place avec un léger rebond.
 */
import type { TearResult } from '@/components/BoosterTear.vue'

const GHOST_Z = 40

export async function burstFromPack(
  result: TearResult,
  cards: HTMLElement[],
  pack: HTMLElement | null,
): Promise<void> {
  const fallback = {
    x: result.rect.left + result.rect.width / 2,
    y: result.rect.top + result.rect.height * 0.35,
    rot: 0,
  }
  const middle = result.cards[Math.floor(result.cards.length / 2)] ?? fallback

  const flights = cards.map((el, i) => {
    const from = result.cards[i] ?? middle
    const box = el.getBoundingClientRect()
    const dx = from.x - (box.left + box.width / 2)
    const dy = from.y - (box.top + box.height / 2)
    const s = result.cardWidth / box.width
    const lift = box.height * s * 0.95 // de quoi sortir entièrement du sachet
    const tilt = from.rot * 2
    return el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${from.rot}rad) scale(${s})`,
          zIndex: GHOST_Z - 10,
          easing: 'cubic-bezier(.3, .6, .4, 1)',
        },
        {
          offset: 0.3,
          transform: `translate(${dx}px, ${dy - lift}px) rotate(${tilt}rad) scale(${s * 1.12})`,
          zIndex: GHOST_Z - 10,
          easing: 'cubic-bezier(.25, .9, .35, 1.12)',
        },
        { offset: 0.31, zIndex: GHOST_Z + 10 },
        { transform: 'translate(0px, 0px) rotate(0rad) scale(1)', zIndex: GHOST_Z + 10 },
      ],
      { duration: 980, delay: i * 140, fill: 'backwards' },
    )
  })

  await Promise.all(flights.map((a) => a.finished.catch(() => undefined)))

  // Le sachet vide s'efface.
  await pack
    ?.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(28px)' },
      ],
      { duration: 380, easing: 'ease-in', fill: 'forwards' },
    )
    .finished.catch(() => undefined)
}

export const GHOST_Z_INDEX = GHOST_Z
