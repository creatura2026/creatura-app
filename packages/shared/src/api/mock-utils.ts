/** Outils communs aux API simulées des deux applications. */
import { ApiError, type ErrorCode, type PageMeta } from './types'

const TITLES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Requête invalide',
  INVALID_CREDENTIALS: 'Identifiants incorrects',
  UNAUTHENTICATED: 'Authentification requise',
  FORBIDDEN: 'Accès refusé',
  NOT_FOUND: 'Ressource introuvable',
  LOGIN_ALREADY_USED: 'Identifiant déjà utilisé',
  PSEUDO_ALREADY_USED: 'Pseudonyme déjà utilisé',
  BOOSTER_ALREADY_CLAIMED: 'Booster déjà réclamé',
  TRADE_NOT_PENDING: 'Échange clos',
  CARDS_UNAVAILABLE: 'Cartes indisponibles',
  CARDS_NOT_OWNED: 'Cartes non possédées',
  TRADE_WITH_SELF: 'Échange avec soi-même',
  RATE_LIMITED: 'Trop de tentatives',
}

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  LOGIN_ALREADY_USED: 409,
  PSEUDO_ALREADY_USED: 409,
  BOOSTER_ALREADY_CLAIMED: 409,
  TRADE_NOT_PENDING: 409,
  CARDS_UNAVAILABLE: 409,
  CARDS_NOT_OWNED: 422,
  TRADE_WITH_SELF: 422,
  RATE_LIMITED: 429,
}

export function problem(
  code: ErrorCode,
  detail?: string,
  extra: { errors?: { field: string; message: string }[]; boosterId?: string } = {},
): ApiError {
  return new ApiError({
    type: `https://app.creatura.fr/problems/${code.toLowerCase().replace(/_/g, '-')}`,
    title: TITLES[code],
    status: STATUS[code],
    code,
    detail,
    ...extra,
  })
}

/** Latence réseau simulée, pour voir les états de chargement. */
export function delay(min = 180, max = 450): Promise<void> {
  const ms = import.meta.env.MODE === 'test' ? 0 : min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function paginate<T>(all: T[], page = 1, pageSize = 20): PageMeta & { items: T[] } {
  const size = Math.min(Math.max(pageSize, 1), 100)
  const totalPages = Math.ceil(all.length / size)
  const start = (Math.max(page, 1) - 1) * size
  return {
    items: all.slice(start, start + size),
    page,
    pageSize: size,
    totalItems: all.length,
    totalPages,
  }
}

/** Comparaison sans casse ni accents, comme le paramètre `search` du contrat. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
  )
}

/** Clone profond : les réponses simulées ne doivent pas partager de références avec la « base ». */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Générateur pseudo-aléatoire déterministe (mulberry32), pour des données fictives stables. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
