import { onScopeDispose, ref, watch, type Ref } from 'vue'

/** Copie de `source` mise à jour seulement après `ms` millisecondes sans changement. */
export function useDebounced<T>(source: Ref<T>, ms = 250): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(source, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => (debounced.value = value), ms)
  })
  onScopeDispose(() => clearTimeout(timer))
  return debounced
}
