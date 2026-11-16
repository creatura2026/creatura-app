/** Notifications éphémères, partagées par toute l'application. */
import { reactive } from 'vue'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

let next = 1
export const toasts = reactive<Toast[]>([])

export function dismissToast(id: number): void {
  const index = toasts.findIndex((t) => t.id === id)
  if (index >= 0) toasts.splice(index, 1)
}

export function toast(message: string, tone: ToastTone = 'info', duration = 4000): void {
  const id = next++
  toasts.push({ id, tone, message })
  if (toasts.length > 3) toasts.shift()
  setTimeout(() => dismissToast(id), duration)
}
