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

/** 401 → reconnexion ; 403 → page « accès refusé ». */
function handleAuthErrors(error: unknown) {
  if (isApiError(error, 'UNAUTHENTICATED')) {
    useAuthStore(pinia).clearSession()
    router.replace({ name: 'login', query: { expired: '1' } })
  } else if (isApiError(error, 'FORBIDDEN')) {
    router.replace({ name: 'forbidden' })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthErrors }),
  mutationCache: new MutationCache({ onError: handleAuthErrors }),
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
