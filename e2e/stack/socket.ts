/** Enregistre les messages du WebSocket de la salle d'échange vus par une page. */
import type { Page } from '@playwright/test'

export interface RoomMessage {
  type: string
  [key: string]: unknown
}

export interface RoomSocketLog {
  /** Messages envoyés par la page (offer, ready, chat). */
  sent: RoomMessage[]
  /** Messages reçus du serveur (init, trade, chat, presence, error). */
  received: RoomMessage[]
  /** Nombre de connexions ouvertes (une de plus à chaque reconnexion). */
  connections: number
  receivedTypes: () => string[]
  sentTypes: () => string[]
  /** Nombre d'états complets (init) reçus : une reconnexion est terminée quand il augmente. */
  inits: () => number
}

const parse = (payload: string | Buffer): RoomMessage => {
  try {
    return JSON.parse(String(payload)) as RoomMessage
  } catch {
    return { type: '?' }
  }
}

/** À appeler AVANT d'ouvrir la salle : les messages arrivent dès la connexion. */
export function recordRoomSocket(page: Page): RoomSocketLog {
  const log: RoomSocketLog = {
    sent: [],
    received: [],
    connections: 0,
    receivedTypes: () => log.received.map((m) => m.type),
    sentTypes: () => log.sent.map((m) => m.type),
    inits: () => log.received.filter((m) => m.type === 'init').length,
  }
  page.on('websocket', (ws) => {
    if (!/\/trades\/[^/]+\/live/.test(ws.url())) return
    log.connections++
    ws.on('framesent', (frame) => log.sent.push(parse(frame.payload)))
    ws.on('framereceived', (frame) => log.received.push(parse(frame.payload)))
  })
  return log
}
