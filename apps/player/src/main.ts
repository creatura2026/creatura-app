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

/** Jeton absent ou expiré (401) : retour à la connexion, quelle que soit la requête. */
function handleUnauthenticated(error: unknown) {
  if (!isApiError(error, 'UNAUTHENTICATED')) return
  useAuthStore(pinia).clearSession()
  const current = router.currentRoute.value
  if (current.name !== 'login') {
    router.replace({ name: 'login', query: { redirect: current.fullPath, expired: '1' } })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthenticated }),
  mutationCache: new MutationCache({ onError: handleUnauthenticated }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !isApiError(error) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

app.use(VueQueryPlugin, { queryClient })

app.mount('#app')
