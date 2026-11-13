import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LoginRequest, RegisterRequest, User } from '@creatura/shared/api/types'

import { api } from '@/api'
import { readSession, writeSession } from '@/api/token'

export const useAuthStore = defineStore('auth', () => {
  // Une session d'administrateur n'a rien à faire dans l'app joueur.
  const stored = readSession()?.user ?? null
  const user = ref<User | null>(stored?.role === 'ADMIN' ? null : stored)
  const isAuthenticated = computed(() => user.value !== null)

  async function login(credentials: LoginRequest) {
    const tokens = await api.login(credentials)
    // Un administrateur gère le jeu mais n'y joue pas : il passe par le dashboard.
    if (tokens.user.role === 'ADMIN') {
      writeSession(tokens)
      await api.logout().catch(() => {})
      writeSession(null)
      throw new Error(
        'Compte administrateur : il ne joue pas. Connectez-vous au dashboard (/admin/).',
      )
    }
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
