import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import AdminShell from '@/layouts/AdminShell.vue'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAdmin?: boolean
    guestOnly?: boolean
    title?: string
  }
}

const router = createRouter({
  // L'application Desktop charge des fichiers locaux : l'historique « hash » y est nécessaire.
  history:
    import.meta.env.VITE_TARGET === 'desktop'
      ? createWebHashHistory(import.meta.env.BASE_URL)
      : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/connexion',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true, title: 'Connexion' },
    },
    {
      path: '/acces-refuse',
      name: 'forbidden',
      component: () => import('@/views/ForbiddenView.vue'),
      meta: { title: 'Accès refusé' },
    },
    {
      path: '/',
      component: AdminShell,
      meta: { requiresAdmin: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: 'Statistiques' },
        },
        {
          path: 'echanges',
          name: 'trades',
          component: () => import('@/views/TradesView.vue'),
          meta: { title: 'Échanges' },
        },
        {
          path: 'raretes',
          name: 'rarities',
          component: () => import('@/views/RaritiesView.vue'),
          meta: { title: 'Raretés' },
        },
        {
          path: 'cartes',
          name: 'creatures',
          component: () => import('@/views/CreaturesView.vue'),
          meta: { title: 'Cartes' },
        },
        {
          path: 'reglages',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: 'Réglages du booster' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.matched.some((r) => r.meta.requiresAdmin)) {
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
    // Preuve qualité 02 : un joueur se voit refuser l'accès administrateur.
    if (!auth.isAdmin) return { name: 'forbidden' }
  }
  if (to.meta.guestOnly && auth.isAuthenticated)
    return auth.isAdmin ? { name: 'dashboard' } : { name: 'forbidden' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Créatura Admin` : 'Créatura Admin'
})

export default router
