import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { toTypedSchema } from '../forms'

const schema = toTypedSchema(
  z.object({
    pseudo: z.string({ error: 'Choisissez un pseudonyme.' }).trim().min(3, 'Au moins 3 caractères.'),
    surnom: z.string().optional(),
    cartes: z.array(z.object({ nom: z.string().min(1, 'Nom manquant.') })).optional(),
  }),
)

describe('toTypedSchema (zod 4 → vee-validate)', () => {
  it('rend les valeurs nettoyées quand le formulaire est valide', async () => {
    expect(await schema.parse({ pseudo: '  Lina ' })).toEqual({ value: { pseudo: 'Lina' }, errors: [] })
  })

  it('donne le message de chaque champ en erreur, champ absent compris', async () => {
    expect(await schema.parse({})).toEqual({
      errors: [{ path: 'pseudo', errors: ['Choisissez un pseudonyme.'] }],
    })
    expect(await schema.parse({ pseudo: 'ab' })).toEqual({
      errors: [{ path: 'pseudo', errors: ['Au moins 3 caractères.'] }],
    })
  })

  it('écrit les chemins dans la syntaxe de vee-validate', async () => {
    const { errors } = await schema.parse({ pseudo: 'Lina', cartes: [{ nom: 'Moussou' }, { nom: '' }] })
    expect(errors).toEqual([{ path: 'cartes[1].nom', errors: ['Nom manquant.'] }])
  })

  it('dit quels champs sont obligatoires', () => {
    expect(schema.describe?.('pseudo')).toEqual({ required: true, exists: true })
    expect(schema.describe?.('surnom')).toEqual({ required: false, exists: true })
    expect(schema.describe?.('inconnu')).toEqual({ required: false, exists: false })
  })
})
