/**
 * Catalogue FICTIF, utilisé tant que l'API n'existe pas.
 * Les quatre créatures illustrées viennent du document de vision ; les autres sont des exemples
 * provisoires (illustrées par un œuf) pour rendre les filtres et la progression parlants.
 */
import type { Creature, Family, Rarity } from '../api/types'
import { eggDataUri } from './egg'

import moussouUrl from '../assets/creatures/moussou.png'
import cristilleUrl from '../assets/creatures/cristille.png'
import brumelUrl from '../assets/creatures/brumel.png'
import flammilleUrl from '../assets/creatures/flammille.png'

export const FAMILIES: Family[] = [
  { code: 'NATURE', label: 'Nature' },
  { code: 'CRISTAL', label: 'Cristal' },
  { code: 'BRUME', label: 'Brume' },
  { code: 'LUEUR', label: 'Lueur' },
]

/** Probabilités de tirage proposées — à valider au point client. */
export const RARITIES: Rarity[] = [
  { code: 'COMMON', label: 'Commun', rank: 1, dropRate: 0.65 },
  { code: 'UNCOMMON', label: 'Peu commun', rank: 2, dropRate: 0.27 },
  { code: 'RARE', label: 'Rare', rank: 3, dropRate: 0.08 },
]

/** Couleur d'accent de chaque famille (fond de carte, œufs). */
export const FAMILY_COLORS: Record<string, { bg: string; fill: string; spot: string }> = {
  NATURE: { bg: 'bg-mint', fill: '#8fc79b', spot: '#5f9e6e' },
  CRISTAL: { bg: 'bg-butter', fill: '#f6cb67', spot: '#d99b32' },
  BRUME: { bg: 'bg-sky', fill: '#b9c8e6', spot: '#8399c6' },
  LUEUR: { bg: 'bg-salmon', fill: '#f29a7f', spot: '#c95a43' },
}

const family = (code: string): Family => FAMILIES.find((f) => f.code === code)!
const rarity = (code: string) => {
  const r = RARITIES.find((x) => x.code === code)!
  return { code: r.code, label: r.label }
}
const egg = (familyCode: string) => {
  const c = FAMILY_COLORS[familyCode]!
  return eggDataUri(c.fill, c.spot)
}

export const CREATURES: Creature[] = [
  {
    id: '0b6f2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    name: 'Moussou',
    family: family('NATURE'),
    rarity: rarity('COMMON'),
    imageUrl: moussouUrl,
    description: 'Habite les sous-bois.',
  },
  {
    id: '7c8d9e0f-1a2b-4c3d-9e8f-7a6b5c4d3e2f',
    name: 'Cristille',
    family: family('CRISTAL'),
    rarity: rarity('RARE'),
    imageUrl: cristilleUrl,
    description: 'Un insecte aux ailes minérales.',
  },
  {
    id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
    name: 'Brumel',
    family: family('BRUME'),
    rarity: rarity('RARE'),
    imageUrl: brumelUrl,
    description: 'Se déplace dans les nuages.',
  },
  {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    name: 'Flammille',
    family: family('LUEUR'),
    rarity: rarity('UNCOMMON'),
    imageUrl: flammilleUrl,
    description: 'Éclaire les sentiers.',
  },
  {
    id: 'c0ffee00-0001-4000-8000-000000000001',
    name: 'Glandinet',
    family: family('NATURE'),
    rarity: rarity('COMMON'),
    imageUrl: egg('NATURE'),
    description: 'Enterre des glands qu’il oublie aussitôt.',
  },
  {
    id: 'c0ffee00-0002-4000-8000-000000000002',
    name: 'Ronceline',
    family: family('NATURE'),
    rarity: rarity('UNCOMMON'),
    imageUrl: egg('NATURE'),
    description: 'Se cache dans les haies fleuries.',
  },
  {
    id: 'c0ffee00-0003-4000-8000-000000000003',
    name: 'Quartzou',
    family: family('CRISTAL'),
    rarity: rarity('COMMON'),
    imageUrl: egg('CRISTAL'),
    description: 'Roule sur les pentes des grottes.',
  },
  {
    id: 'c0ffee00-0004-4000-8000-000000000004',
    name: 'Améthine',
    family: family('CRISTAL'),
    rarity: rarity('UNCOMMON'),
    imageUrl: egg('CRISTAL'),
    description: 'Scintille quand il pleut.',
  },
  {
    id: 'c0ffee00-0005-4000-8000-000000000005',
    name: 'Nuageon',
    family: family('BRUME'),
    rarity: rarity('COMMON'),
    imageUrl: egg('BRUME'),
    description: 'Dort au sommet des collines.',
  },
  {
    id: 'c0ffee00-0006-4000-8000-000000000006',
    name: 'Vapeline',
    family: family('BRUME'),
    rarity: rarity('UNCOMMON'),
    imageUrl: egg('BRUME'),
    description: 'Apparaît à l’aube au-dessus des lacs.',
  },
  {
    id: 'c0ffee00-0007-4000-8000-000000000007',
    name: 'Lucioline',
    family: family('LUEUR'),
    rarity: rarity('COMMON'),
    imageUrl: egg('LUEUR'),
    description: 'Clignote pour saluer ses amis.',
  },
  {
    id: 'c0ffee00-0008-4000-8000-000000000008',
    name: 'Braisard',
    family: family('LUEUR'),
    rarity: rarity('RARE'),
    imageUrl: egg('LUEUR'),
    description: 'Réchauffe les voyageurs égarés.',
  },
]

export function findCreature(id: string): Creature | undefined {
  return CREATURES.find((c) => c.id === id)
}

/** Ordre d'affichage : famille, puis rareté, puis nom. */
export function compareCreatures(
  a: { name: string; family: Family; rarity: { code: string } },
  b: { name: string; family: Family; rarity: { code: string } },
): number {
  const fa = FAMILIES.findIndex((f) => f.code === a.family.code)
  const fb = FAMILIES.findIndex((f) => f.code === b.family.code)
  if (fa !== fb) return fa - fb
  const ra = RARITIES.findIndex((r) => r.code === a.rarity.code)
  const rb = RARITIES.findIndex((r) => r.code === b.rarity.code)
  if (ra !== rb) return ra - rb
  return a.name.localeCompare(b.name, 'fr')
}
