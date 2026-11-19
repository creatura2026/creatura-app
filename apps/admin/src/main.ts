import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MutationCache, QueryCache, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { isApiError } from '@creatura/shared/api/types'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

/**
 * 401 (session expirée) → reconnexion, pour les requêtes comme pour les actions.
 * 403 : seul le chargement d'une page (query) renvoie vers « accès refusé » — c'est un vrai
 * défaut de rôle. Une action refusée (mutation) ne doit PAS détourner la navigation : le 403
 * peut venir d'une règle serveur (WAF, quota…) et non du rôle. Elle est laissée au `catch` de
 * l'appelant, qui affiche le message exact en toast.
 */
function handleSessionExpiry(error: unknown) {
  if (isApiError(error, 'UNAUTHENTICATED')) {
    useAuthStore(pinia).clearSession()
    router.replace({ name: 'login', query: { expired: '1' } })
  }
}

function handleQueryErrors(error: unknown) {
  handleSessionExpiry(error)
  if (isApiError(error, 'FORBIDDEN')) {
    router.replace({ name: 'forbidden' })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryErrors }),
  mutationCache: new MutationCache({ onError: handleSessionExpiry }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (count, error) => !isApiError(error) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

app.use(VueQueryPlugin, { queryClient })

app.mount('#app')
