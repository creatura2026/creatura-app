import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSessionIdle } from '@creatura/shared/idle'

const KEY = 'test.session.activity'
const IDLE = 120 // 2 minutes, comme le test en conditions réelles

function setup(active = true) {
  const scope = effectScope()
  const signedIn = ref(active)
  const keepAlive = vi.fn(() => Promise.resolve())
  const onExpire = vi.fn()
  const idle = scope.run(() =>
    useSessionIdle({
      storageKey: KEY,
      active: signedIn,
      idleSeconds: () => IDLE,
      keepAlive,
      onExpire,
    }),
  )!
  return { idle, signedIn, keepAlive, onExpire, scope }
}

const act = () => window.dispatchEvent(new Event('pointerdown'))

describe('expiration des sessions pour inactivité', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('avertit 30 s avant puis expire après 2 min sans action', async () => {
    const { idle, onExpire, scope } = setup()
    vi.advanceTimersByTime(89_000)
    expect(idle.warning.value).toBe(false)
    vi.advanceTimersByTime(2_000) // 91 s : moins de 30 s restantes
    expect(idle.warning.value).toBe(true)
    expect(idle.secondsLeft.value).toBeLessThanOrEqual(30)
    expect(onExpire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(idle.warning.value).toBe(false)
    scope.stop()
  })

  it("une action de l'utilisateur repousse l'échéance et renouvelle les jetons", () => {
    const { onExpire, keepAlive, scope } = setup()
    vi.advanceTimersByTime(60_000)
    act() // une minute après la connexion : plus d'un quart de la durée, renouvellement
    expect(keepAlive).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100_000) // 1 min 40 après l'action : pas encore expirée
    expect(onExpire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(21_000)
    expect(onExpire).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('le renouvellement des jetons est limité à un par quart de la durée', () => {
    const { keepAlive, scope } = setup()
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(5_000)
      act()
    }
    // 50 s d'actions continues, quart de la durée = 30 s : la première action (date du dernier
    // renouvellement inconnue au chargement de la page), puis une seule 30 s plus tard.
    expect(keepAlive).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('« Rester connecté » ferme l’avertissement et repart pour 2 min', () => {
    const { idle, onExpire, scope } = setup()
    vi.advanceTimersByTime(100_000)
    expect(idle.warning.value).toBe(true)
    idle.stay()
    expect(idle.warning.value).toBe(false)
    vi.advanceTimersByTime(110_000)
    expect(onExpire).not.toHaveBeenCalled()
    scope.stop()
  })

  it('une action après l’échéance ne ranime pas la session (onglet en veille)', () => {
    const { onExpire, scope } = setup()
    // Onglet en arrière-plan : les minuteries sont suspendues, l'heure avance quand même.
    vi.setSystemTime(Date.now() + 5 * 60_000)
    act()
    expect(onExpire).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('les onglets partagent la même échéance', () => {
    const { onExpire, scope } = setup()
    vi.advanceTimersByTime(100_000)
    localStorage.setItem(KEY, String(Date.now())) // action dans un autre onglet
    vi.advanceTimersByTime(100_000)
    expect(onExpire).not.toHaveBeenCalled()
    scope.stop()
  })

  it('ne tourne pas sans utilisateur connecté, et repart de zéro à la connexion', async () => {
    localStorage.setItem(KEY, String(Date.now() - 60 * 60_000)) // vieille activité
    const { signedIn, onExpire, scope } = setup(false)
    vi.advanceTimersByTime(300_000)
    expect(onExpire).not.toHaveBeenCalled()
    signedIn.value = true
    await nextTick()
    vi.advanceTimersByTime(60_000)
    expect(onExpire).not.toHaveBeenCalled()
    scope.stop()
  })
})
