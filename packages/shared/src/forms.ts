/**
 * Schéma zod 4 → schéma typé de vee-validate (`useForm({ validationSchema })`).
 *
 * L'adaptateur officiel, `@vee-validate/zod`, ne prend en charge que zod 3, et vee-validate 4 ne
 * lit pas zod 4 directement. Il suffit pour nos formulaires : des objets à plat, un message par
 * règle non respectée.
 */
import type { TypedSchema, TypedSchemaError } from 'vee-validate'
import type { z } from 'zod'

/** Chemin vee-validate : `cartes[0].nom` pour le chemin zod `['cartes', 0, 'nom']`. */
function formPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i ? '.' : ''}${String(key)}`))
    .join('')
}

export function toTypedSchema<T extends z.ZodType>(
  schema: T,
): TypedSchema<z.input<T>, z.output<T>> {
  return {
    __type: 'VVTypedSchema',
    async parse(values) {
      const result = await schema.safeParseAsync(values)
      if (result.success) return { value: result.data, errors: [] }
      const byPath = new Map<string, TypedSchemaError>()
      for (const issue of result.error.issues) {
        const path = formPath(issue.path)
        const entry = byPath.get(path) ?? { path, errors: [] }
        entry.errors.push(issue.message)
        byPath.set(path, entry)
      }
      return { errors: [...byPath.values()] }
    },
    describe(path) {
      if (!path) return { required: true, exists: true }
      const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape
      const field = shape?.[path]
      if (!field) return { required: false, exists: false }
      return { required: !field.safeParse(undefined).success, exists: true }
    },
  }
}
