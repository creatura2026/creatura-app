/**
 * Connexion à une salle d'échange : l'échange, la discussion et la présence de l'autre joueur,
 * tenus à jour par les messages du serveur (WebSocket `/trades/{tradeId}/live`).
 *
 * Aucune mise à jour optimiste : une action n'est visible qu'une fois confirmée par le serveur, qui
 * l'envoie aux deux joueurs en même temps. Les deux écrans montrent donc toujours le même échange.
 */
import { onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import type { TradeConnection } from '@creatura/shared/api/contract'
import type {
  Problem,
  Trade,
  TradeItemInput,
  TradeMessage,
  TradeServerMessage,
} from '@creatura/shared/api/types'

import { api } from '@/api'
import { keys, useInvalidateCollection } from '@/api/queries'

export interface TradeRoomHooks {
  /** L'échange a changé ; `previous` est son état juste avant (null à la connexion). */
  onTrade?: (trade: Trade, previous: Trade | null) => void
  onMessage?: (message: TradeMessage) => void
  /** Action refusée par le serveur, ou carte devenue indisponible. */
  onError?: (problem: Problem) => void
}

export function useTradeRoom(tradeId: MaybeRefOrGetter<string>, hooks: TradeRoomHooks = {}) {
  const trade = shallowRef<Trade | null>(null)
  const messages = ref<TradeMessage[]>([])
  /** Identifiants des joueurs présents dans la salle. */
  const online = ref<string[]>([])
  /** Le serveur a envoyé l'état de la salle. */
  const connected = ref(false)

  const client = useQueryClient()
  const invalidateCollection = useInvalidateCollection()
  let connection: TradeConnection | null = null

  function setTrade(next: Trade) {
    const previous = trade.value
    trade.value = next
    client.setQueryData(keys.trade(next.id), next)
    if (previous && previous.status !== next.status) {
      // Conclu ou abandonné : les listes d'échanges changent, et les collections si c'est conclu.
      void (next.status === 'ACCEPTED'
        ? invalidateCollection()
        : client.invalidateQueries({ queryKey: ['trades'] }))
    }
    hooks.onTrade?.(next, previous)
  }

  function receive(message: TradeServerMessage) {
    switch (message.type) {
      case 'init':
        messages.value = message.messages
        online.value = message.online
        connected.value = true
        setTrade(message.trade)
        break
      case 'trade':
        setTrade(message.trade)
        break
      case 'chat':
        // Garde-fou : un message déjà affiché (même identifiant) n'est pas ajouté une seconde fois.
        if (messages.value.some((m) => m.id === message.message.id)) break
        messages.value = [...messages.value, message.message]
        hooks.onMessage?.(message.message)
        break
      case 'presence':
        online.value = message.online
          ? [...new Set([...online.value, message.playerId])]
          : online.value.filter((id) => id !== message.playerId)
        break
      case 'error':
        hooks.onError?.(message.problem)
        break
    }
  }

  function leave() {
    connection?.close()
    connection = null
    connected.value = false
  }

  watch(
    () => toValue(tradeId),
    (id) => {
      leave()
      trade.value = null
      messages.value = []
      online.value = []
      connection = api.joinTrade(id, receive)
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    leave()
    // L'échange a pu changer pendant la visite : la liste se rafraîchit au retour.
    void client.invalidateQueries({ queryKey: ['trades'] })
  })

  return {
    trade,
    messages,
    online,
    connected,
    /** Remplace son tapis par cette liste de cartes. */
    setOffer: (items: TradeItemInput[]) => connection?.send({ type: 'offer', items }),
    /** Valide l'échange tel qu'il est, ou retire sa validation. */
    setReady: (ready: boolean) => connection?.send({ type: 'ready', ready }),
    say: (text: string) => connection?.send({ type: 'chat', text }),
  }
}
