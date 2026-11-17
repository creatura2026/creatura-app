import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LoginRequest, PasswordChangeRequest, User } from '@creatura/shared/api/types'

import { api, session } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(session.read()?.user ?? null)
  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

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
    session.write(await api.changePassword(body))
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
    login,
    logout,
    changePassword,
    deleteAccount,
    clearSession,
  }
})
