<script setup lang="ts">
/** Jeu d'icônes à angles droits, dans l'esprit pixel du document. */
export type IconName =
  | 'home'
  | 'booster'
  | 'collection'
  | 'catalogue'
  | 'trade'
  | 'user'
  | 'search'
  | 'logout'
  | 'chart'
  | 'list'
  | 'menu'
  | 'close'
  | 'check'
  | 'arrow-left'
  | 'arrow-right'
  | 'plus'
  | 'clock'
  | 'gem'
  | 'lock'
  | 'filter'
  | 'refresh'

const PATHS: Record<IconName, string> = {
  home: 'M3 11 12 4l9 7M5 9.5V20h5v-6h4v6h5V9.5',
  booster: 'M6 3h12v18H6zM6 6h12M6 18h12M10 11h4v3h-4z',
  collection: 'M4 6h11v14H4zM9 3h11v14',
  catalogue: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  trade: 'M4 8h14l-4-4M20 16H6l4 4',
  user: 'M8 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  search: 'M4 10a6 6 0 1 0 12 0 6 6 0 1 0-12 0M15 15l6 6',
  logout: 'M10 4H4v16h6M14 8l4 4-4 4M18 12H9',
  chart: 'M4 20h16M7 20v-7M12 20V6M17 20v-10',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h1M4 12h1M4 18h1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M4 12l5 5L20 6',
  'arrow-left': 'M20 12H5M11 6l-6 6 6 6',
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  clock: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 7v5l3 3',
  gem: 'M6 4h12l3 5-9 11L3 9zM3 9h18M12 20 9 9l3-5 3 5z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  refresh: 'M20 5v5h-5M4 19v-5h5M18.5 10A7 7 0 0 0 6 7.5M5.5 14A7 7 0 0 0 18 16.5',
}

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 22 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.25"
    stroke-linecap="square"
    stroke-linejoin="miter"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
