import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LoginRequest, RegisterRequest, User } from '@creatura/shared/api/types'

import { api } from '@/api'
import { readSession, writeSession } from '@/api/token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(readSession()?.user ?? null)
  const isAuthenticated = computed(() => user.value !== null)

  async function login(credentials: LoginRequest) {
    const tokens = await api.login(credentials)
    writeSession(tokens)
    user.value = tokens.user
    return tokens.user
  }

  /** UC-01 puis connexion automatique. */
  async function register(body: RegisterRequest) {
    await api.register(body)
    return login({ login: body.login, password: body.password })
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      clearSession()
    }
  }

  /** Session expirée ou invalide : on oublie l'utilisateur localement. */
  function clearSession() {
    writeSession(null)
    user.value = null
  }

  return { user, isAuthenticated, login, register, logout, clearSession }
})
