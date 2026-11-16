import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LoginRequest, User } from '@creatura/shared/api/types'

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

  function clearSession() {
    session.write(null)
    user.value = null
  }

  return { user, isAuthenticated, isAdmin, login, logout, clearSession }
})
