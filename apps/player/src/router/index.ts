import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import AppShell from '@/layouts/AppShell.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Page réservée aux joueurs connectés. */
    requiresAuth?: boolean
    /** Page réservée aux visiteurs (accueil public, connexion, inscription). */
    guestOnly?: boolean
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/connexion',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true, title: 'Connexion' },
    },
    {
      path: '/inscription',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guestOnly: true, title: 'Créer un compte' },
    },
    {
      path: '/',
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        {
          path: 'accueil',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { title: 'Accueil' },
        },
        {
          path: 'booster',
          name: 'booster',
          component: () => import('@/views/BoosterView.vue'),
          meta: { title: 'Booster du jour' },
        },
        {
          path: 'catalogue',
          name: 'catalogue',
          component: () => import('@/views/CatalogueView.vue'),
          meta: { title: 'Catalogue' },
        },
        {
          path: 'catalogue/:id',
          name: 'creature',
          component: () => import('@/views/CreatureView.vue'),
          props: true,
          meta: { title: 'Créature' },
        },
        {
          path: 'collection',
          name: 'collection',
          component: () => import('@/views/CollectionView.vue'),
          meta: { title: 'Ma collection' },
        },
        {
          path: 'echanges',
          name: 'trades',
          component: () => import('@/views/TradesView.vue'),
          meta: { title: 'Échanges' },
        },
        {
          path: 'echanges/nouveau',
          name: 'new-trade',
          component: () => import('@/views/NewTradeView.vue'),
          meta: { title: 'Ouvrir un échange' },
        },
        {
          path: 'echanges/:id',
          name: 'trade',
          component: () => import('@/views/TradeRoomView.vue'),
          props: true,
          meta: { title: 'Échange' },
        },
        {
          path: 'profil',
          name: 'profile',
          component: () => import('@/views/ProfileView.vue'),
          meta: { title: 'Mon profil' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Page introuvable' },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.matched.some((r) => r.meta.requiresAuth) && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'home' }
  }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Créatura` : 'Créatura'
})

export default router
