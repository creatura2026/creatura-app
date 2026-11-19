<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionIdle } from '@creatura/shared/idle'
import { DEFAULT_IDLE_SECONDS } from '@creatura/shared/session'
import SessionIdleDialog from '@creatura/shared/ui/SessionIdleDialog.vue'
import ToastHost from '@creatura/shared/ui/ToastHost.vue'

import { api, session } from '@/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const idleSeconds = () => session.read()?.idleSeconds ?? DEFAULT_IDLE_SECONDS

/** Expiration des sessions après une période sans action de l'utilisateur. */
const idle = useSessionIdle({
  storageKey: `${session.key}.activity`,
  active: () => auth.isAuthenticated,
  idleSeconds,
  keepAlive: () => api.keepAlive(),
  onExpire: () => {
    auth.clearSession()
    const minutes = String(Math.round((idleSeconds() / 60) * 10) / 10)
    router.replace({ name: 'login', query: { expired: 'idle', minutes } })
  },
})

async function logoutNow() {
  await auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <RouterView />
  <ToastHost />
  <SessionIdleDialog
    v-if="idle.warning.value"
    :seconds-left="idle.secondsLeft.value"
    @stay="idle.stay()"
    @logout="logoutNow"
  />
</template>
