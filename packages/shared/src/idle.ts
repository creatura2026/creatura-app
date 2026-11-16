/**
 * Expiration des sessions après une période sans action de l'utilisateur.
 *
 * - Activité = actions de l'utilisateur : clic, touche, molette, toucher, défilement, retour sur
 *   l'onglet. Les rechargements automatiques et une salle d'échange ouverte ne comptent pas.
 * - La dernière activité est rangée dans le stockage local : tous les onglets de l'application
 *   partagent la même échéance (agir dans un onglet garde les autres connectés).
 * - `warnSeconds` avant l'échéance, `warning` passe à vrai (fenêtre « Rester connecté ») ; à
 *   l'échéance, `onExpire` est appelé une fois.
 * - Pendant que l'utilisateur agit, `keepAlive` (renouvellement des jetons) est appelé au plus tous
 *   les quarts de la durée : la session reste valide côté serveur, qui la limite aussi.
 * - Une action faite après l'échéance (onglet en veille, ordinateur réveillé) ne ranime pas la
 *   session : l'échéance est vérifiée avant de noter l'activité.
 */
import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface SessionIdleOptions {
  /** Clé de stockage de la dernière activité (une par application). */
  storageKey: string
  /** Vrai quand un utilisateur est connecté : le minuteur ne tourne que dans ce cas. */
  active: MaybeRefOrGetter<boolean>
  /** Inactivité permise, en secondes. */
  idleSeconds: () => number
  /** Renouvelle les jetons (repousse l'expiration côté serveur). */
  keepAlive: () => Promise<void>
  /** La session a expiré : l'application déconnecte l'utilisateur. */
  onExpire: () => void
  /** Durée de l'avertissement avant l'échéance, en secondes. */
  warnSeconds?: number
}

export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
const TICK_MS = 1000
const WRITE_EVERY_MS = 2000 // le stockage local n'est pas réécrit à chaque événement

function readNumber(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Stockage indisponible : l'échéance reste propre à cet onglet.
  }
}

export function useSessionIdle(options: SessionIdleOptions) {
  const warnSeconds = options.warnSeconds ?? 30
  const activityKey = options.storageKey
  const keepAliveKey = `${options.storageKey}.renewed`

  /** L'avertissement est affiché. */
  const warning = ref(false)
  /** Secondes avant l'expiration (mis à jour chaque seconde pendant l'avertissement). */
  const secondsLeft = ref(0)

  let localActivity = 0 // repli si le stockage local est indisponible
  let lastWrite = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let expired = false

  const idleMs = () => Math.max(1, options.idleSeconds()) * 1000
  const lastActivity = () => Math.max(readNumber(activityKey) ?? 0, localActivity)

  function expire() {
    if (expired) return
    expired = true
    warning.value = false
    stop()
    options.onExpire()
  }

  /** Vrai si l'échéance est passée (et la session alors expirée). */
  function checkExpired(now = Date.now()): boolean {
    const left = idleMs() - (now - lastActivity())
    if (left <= 0) {
      expire()
      return true
    }
    secondsLeft.value = Math.ceil(left / 1000)
    warning.value = left <= warnSeconds * 1000
    return false
  }

  function renewIfDue(now: number) {
    const renewed = readNumber(keepAliveKey) ?? 0
    if (now - renewed < idleMs() / 4) return
    writeNumber(keepAliveKey, now)
    options.keepAlive().catch(() => {
      // Session déjà expirée côté serveur : la requête suivante renverra 401 et déconnectera.
    })
  }

  /** Une action de l'utilisateur : repousse l'échéance (sauf si elle est déjà passée). */
  function markActivity() {
    if (!timer || expired) return
    const now = Date.now()
    if (checkExpired(now)) return
    localActivity = now
    if (now - lastWrite >= WRITE_EVERY_MS || warning.value) {
      lastWrite = now
      writeNumber(activityKey, now)
    }
    warning.value = false
    renewIfDue(now)
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') markActivity()
  }

  function start() {
    if (timer) return
    expired = false
    const now = Date.now()
    // Session d'un onglet précédent : son échéance s'applique ; sinon, la connexion est une activité.
    if (readNumber(activityKey) === null) writeNumber(activityKey, now)
    if (checkExpired(now)) return
    timer = setInterval(() => checkExpired(), TICK_MS)
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, markActivity, {
        capture: true,
        passive: true,
      })
    }
    document.addEventListener('visibilitychange', onVisibility)
  }

  function stop() {
    clearInterval(timer)
    timer = undefined
    warning.value = false
    for (const name of ACTIVITY_EVENTS)
      window.removeEventListener(name, markActivity, { capture: true })
    document.removeEventListener('visibilitychange', onVisibility)
  }

  /** Nouvelle session (connexion) : l'échéance repart de maintenant. */
  function reset() {
    const now = Date.now()
    localActivity = now
    writeNumber(activityKey, now)
    writeNumber(keepAliveKey, now)
  }

  watch(
    () => toValue(options.active),
    (active, wasActive) => {
      if (active) {
        if (wasActive === false) reset() // vient de se connecter
        start()
      } else {
        stop()
      }
    },
    { immediate: true },
  )
  onScopeDispose(stop)

  return {
    warning,
    secondsLeft,
    /** Bouton « Rester connecté » : compte comme une action de l'utilisateur. */
    stay: markActivity,
  }
}
