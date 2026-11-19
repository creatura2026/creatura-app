import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LoginRequest, PasswordChangeRequest, User } from '@creatura/shared/api/types'

import { api, session } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(session.read()?.user ?? null)
  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')
  /** Admin créé depuis le dashboard : remplace d'abord son mot de passe provisoire (AS-71). */
  const mustChangePassword = computed(() => user.value?.mustChangePassword === true)
  
  async function login(credentials: LoginRequest) {
    const tokens = await api.login(credentials)
    session.write(tokens)
    user.value = tokens.user
    return tokens.user
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      clearSession()
    }
  }

  /** Nouveau mot de passe : cette session reçoit de nouveaux jetons, les autres sont fermées. */
  async function changePassword(body: PasswordChangeRequest) {
    const tokens = await api.changePassword(body)
    session.write(tokens)
    user.value = tokens.user // mustChangePassword repasse à faux (AS-71)
  }

  /** Refusé (LAST_ADMIN) s'il ne reste aucun autre administrateur. */
  async function deleteAccount(password: string) {
    await api.deleteAccount({ password })
    clearSession()
  }

  function clearSession() {
    session.write(null)
    user.value = null
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    mustChangePassword,
    login,
    logout,
    changePassword,
    deleteAccount,
    clearSession,
  }
})
