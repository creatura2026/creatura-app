<script setup lang="ts">
/**
 * Ouverture interactive du booster : le joueur déchire lui-même le haut du sachet.
 *
 * Tout est dessiné dans un canvas basse résolution agrandi sans lissage : rotations, fibres de papier
 * et éclats restent en vrais gros pixels, comme l'illustration.
 * Événements : `torn` quand la déchirure est complète (on peut appeler le serveur),
 * `done` quand les cartes sont sorties et que `ready` est vrai.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import boosterUrl from '@creatura/shared/assets/booster.png'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

/** Ce que la page reçoit à la fin : de quoi faire jaillir les vraies cartes du sachet. */
export interface TearResult {
  /** Image du sachet ouvert et vide, à superposer pendant la sortie des cartes. */
  image: string
  /** Position du canvas à l'écran (coordonnées de la fenêtre). */
  rect: { left: number; top: number; width: number; height: number }
  /** Centre et inclinaison de chaque dos de carte au moment du passage de relais. */
  cards: { x: number; y: number; rot: number }[]
  /** Largeur à l'écran d'un dos de carte dessiné dans le canvas. */
  cardWidth: number
}

const props = withDefaults(defineProps<{ ready: boolean; cards?: number }>(), { cards: 5 })
const emit = defineEmits<{ torn: []; done: [result: TearResult] }>()

// ── Géométrie (en pixels logiques du canvas) ─────────────────────────────────
const W = 144
const H = 168
const OX = 35 // position du sachet dans le canvas
const OY = 50
const TEAR_BASE = 17 // ligne de déchirure, juste sous le sertissage doré
const PEEK = 9 // les cartes dépassent du sachet en attendant le serveur
const RISE = 24 // puis sortent en éventail, la base encore dans le sachet

const INK = '#1b2440'
const CREAM = '#fff7e7'
const PAPER = '#f3e3c3'
const INSIDE = '#7a2e2a' // paroi arrière, visible dans l'ouverture
const SPARK_COLORS = [CREAM, '#ffffff', PAPER, '#f2735f', '#f6cb67']

type Phase = 'loading' | 'idle' | 'tearing' | 'flying' | 'waiting' | 'rising' | 'done'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
}

const canvas = ref<HTMLCanvasElement | null>(null)
/** Zone disponible pour le sachet : le canvas s'adapte à elle, jamais l'inverse. */
const stage = ref<HTMLDivElement | null>(null)
const scale = ref(2)
const progress = ref(0)
const phase = ref<Phase>('loading')

const soundOn = ref(readSoundPref())
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// ── État de la simulation (hors réactivité : mis à jour à chaque image) ──────
let ctx: CanvasRenderingContext2D | null = null
let sw = 0
let sh = 0
let tearY: number[] = []
let start = 0 // première et dernière colonne opaque sur la ligne de déchirure
let end = 0
let bodyPlain: HTMLCanvasElement
let bodyFib: HTMLCanvasElement
let flapPlain: HTMLCanvasElement
let flapFib: HTMLCanvasElement
let cardBack: HTMLCanvasElement

let dir: 0 | 1 | -1 = 0
let front = 0
let frontTarget = 0
let lift = 0
let liftVel = 0
let tearAccum = 0
let dragging = false
let pointer = { x: 0, y: 0 }
let shake = 0
let bounce = 0
let particles: Particle[] = []
let flight = { a: 0, va: 0, dx: 0, dy: 0, vx: 0, vy: 0, alpha: 1, hx: 0, hy: 0 }
let peek = 0
let riseT = 0
let raf = 0
let last = 0
let clock = 0
let hideCards = false

// ── Préparation des calques à partir du sprite ───────────────────────────────
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 4294967296
  }
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function prepare(img: HTMLImageElement) {
  sw = img.naturalWidth
  sh = img.naturalHeight
  const src = makeCanvas(sw, sh)
  const sctx = src.getContext('2d')!
  sctx.drawImage(img, 0, 0)
  const pixels = sctx.getImageData(0, 0, sw, sh)

  // Ligne de déchirure en dents de scie, toujours la même pour un rendu stable.
  const rand = seeded(7)
  let y = TEAR_BASE
  tearY = Array.from({ length: sw }, () => {
    const r = rand()
    if (r < 0.3) y--
    else if (r > 0.7) y++
    y = Math.min(TEAR_BASE + 2, Math.max(TEAR_BASE - 1, y))
    return y
  })
  const alphaAt = (x: number, yy: number) => pixels.data[(yy * sw + x) * 4 + 3]!
  start = tearY.findIndex((ty, x) => alphaAt(x, ty) > 0)
  end = sw - 1 - [...tearY].reverse().findIndex((ty, i) => alphaAt(sw - 1 - i, ty) > 0)

  const split = (keepFlap: boolean, fibers: boolean) => {
    const c = makeCanvas(sw, sh)
    const cctx = c.getContext('2d')!
    const out = cctx.createImageData(sw, sh)
    for (let x = 0; x < sw; x++) {
      for (let yy = 0; yy < sh; yy++) {
        const inFlap = yy < tearY[x]!
        if (inFlap !== keepFlap) continue
        const i = (yy * sw + x) * 4
        out.data.set(pixels.data.subarray(i, i + 4), i)
      }
    }
    cctx.putImageData(out, 0, 0)
    if (fibers) {
      // Fibres de papier sur le bord déchiré (et quelques brins qui dépassent).
      const frand = seeded(keepFlap ? 11 : 23)
      for (let x = start; x <= end; x++) {
        const edge = keepFlap ? tearY[x]! - 1 : tearY[x]!
        if (alphaAt(x, edge) === 0) continue
        cctx.fillStyle = frand() < 0.5 ? CREAM : PAPER
        cctx.fillRect(x, edge, 1, 1)
        if (frand() < 0.28) {
          cctx.fillStyle = '#ffffff'
          cctx.fillRect(x, keepFlap ? edge + 1 : edge - 1, 1, 1)
        }
      }
    }
    return c
  }
  bodyPlain = split(false, false)
  bodyFib = split(false, true)
  flapPlain = split(true, false)
  flapFib = split(true, true)
  cardBack = makeCardBack()
}

/** Dos de carte pixel, dans le même esprit que ceux de l'illustration d'origine. */
function makeCardBack() {
  const c = makeCanvas(20, 28)
  const g = c.getContext('2d')!
  g.fillStyle = INK
  g.fillRect(0, 0, 20, 28)
  g.fillStyle = CREAM
  g.fillRect(1, 1, 18, 26)
  g.fillStyle = '#25334b'
  g.fillRect(2, 2, 16, 24)
  g.fillStyle = '#8bc34a'
  g.fillRect(4, 4, 3, 1)
  g.fillRect(4, 4, 1, 3)
  g.fillRect(13, 23, 3, 1)
  g.fillRect(15, 21, 1, 3)
  g.fillStyle = CREAM // patte
  for (const [x, y] of [
    [7, 10],
    [10, 9],
    [13, 10],
  ] as const)
    g.fillRect(x - 1, y, 2, 2)
  g.fillRect(8, 13, 5, 4)
  return c
}

// ── Son de déchirure (bruit filtré, très court) ──────────────────────────────
let audio: AudioContext | null = null
let noise: AudioBuffer | null = null
let lastTick = 0

function readSoundPref() {
  try {
    return localStorage.getItem('creatura.sound') !== 'off'
  } catch {
    return true
  }
}

watch(soundOn, (on) => {
  try {
    localStorage.setItem('creatura.sound', on ? 'on' : 'off')
  } catch {
    // préférence non conservée
  }
})

function ensureAudio() {
  if (!soundOn.value || audio || typeof AudioContext === 'undefined') return
  audio = new AudioContext()
  noise = audio.createBuffer(1, audio.sampleRate * 0.6, audio.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
}

function rip(duration: number, gain: number, freq: number) {
  if (!soundOn.value || !audio || !noise) return
  const now = audio.currentTime
  const src = audio.createBufferSource()
  src.buffer = noise
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq * (0.75 + Math.random() * 0.5)
  filter.Q.value = 0.8
  const amp = audio.createGain()
  amp.gain.setValueAtTime(gain, now)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  src.connect(filter).connect(amp).connect(audio.destination)
  src.start(now, Math.random() * 0.4, duration + 0.02)
}

function tick() {
  const now = performance.now()
  if (now - lastTick < 28) return
  lastTick = now
  rip(0.04, 0.09, 2600)
  navigator.vibrate?.(6)
}

// ── Particules ──────────────────────────────────────────────────────────────
function spawn(x: number, y: number, n: number, force: number) {
  if (reduced) return
  for (let i = 0; i < n; i++) {
    const max = 28 + Math.random() * 26
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * force + dir * force * 0.4,
      vy: -Math.random() * force * 1.1,
      life: max,
      max,
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!,
    })
  }
}

// ── Déchirure ───────────────────────────────────────────────────────────────
const span = () => Math.max(1, end - start)

function computeProgress() {
  if (dir === 0) return 0
  return dir === 1 ? (front - start) / span() : (end - front) / span()
}

function begin(direction: 1 | -1) {
  if (dir !== 0) return
  dir = direction
  front = frontTarget = direction === 1 ? start : end
  phase.value = 'tearing'
}

function advanceBy(fraction: number) {
  frontTarget = Math.min(end, Math.max(start, frontTarget + dir * fraction * span()))
}

function complete() {
  phase.value = 'flying'
  progress.value = 1
  const hingeX = dir === 1 ? end : start
  flight = {
    a: dir * lift,
    va: dir * (reduced ? 0 : 0.085),
    dx: 0,
    dy: 0,
    vx: dir * (reduced ? 0 : 1.2),
    vy: reduced ? 0 : -2.1,
    alpha: 1,
    hx: hingeX,
    hy: tearY[hingeX]!,
  }
  spawn(OX + hingeX, OY + tearY[hingeX]!, 26, 2.4)
  rip(0.16, 0.14, 1800)
  navigator.vibrate?.(28)
  bounce = reduced ? 0 : 1
  emit('torn')
}

function update(f: number, now: number) {
  clock = now
  if (phase.value === 'tearing') {
    const prev = front
    // La pochette résiste : la déchirure rattrape le doigt avec un léger retard.
    front += (frontTarget - front) * (1 - Math.pow(0.7, f))
    tearAccum += Math.abs(front - prev)
    while (tearAccum >= 1.4) {
      tearAccum -= 1.4
      spawn(OX + front, OY + (tearY[Math.round(front)] ?? TEAR_BASE), 2, 1.3)
      tick()
      if (!reduced) shake = 2
    }
    const torn = dir === 1 ? front - start : end - front
    const pull = dragging ? Math.max(-0.1, Math.min(0.35, (OY + TEAR_BASE - pointer.y) / 45)) : 0
    const target = torn < 0.5 ? 0 : Math.min(0.6, 0.14 + torn * 0.011) + pull
    liftVel += (target - lift) * 0.2 * f
    liftVel *= Math.pow(0.72, f)
    lift += liftVel * f
    const p = computeProgress()
    if (Math.abs(p - progress.value) > 0.01) progress.value = p
    if (p >= 0.985) complete()
  } else if (phase.value === 'flying') {
    flight.vy += 0.12 * f
    flight.dx += flight.vx * f
    flight.dy += flight.vy * f
    flight.a += flight.va * f
    flight.alpha -= (reduced ? 0.1 : 0.022) * f
    peek = Math.min(PEEK, peek + 0.35 * f)
    if (flight.alpha <= 0) phase.value = 'waiting'
  } else if (phase.value === 'waiting') {
    peek = PEEK
    if (props.ready) {
      phase.value = 'rising'
      riseT = 0
    }
  } else if (phase.value === 'rising') {
    riseT += f * 16.67
    if (riseT > (reduced ? 150 : 950)) {
      phase.value = 'done'
      emit('done', handOff())
    }
  }

  if (shake > 0) shake -= f
  if (bounce > 0) bounce = Math.max(0, bounce - 0.06 * f)
  for (const p of particles) {
    p.vy += 0.09 * f
    p.vx *= Math.pow(0.97, f)
    p.x += p.vx * f
    p.y += p.vy * f
    p.life -= f
  }
  particles = particles.filter((p) => p.life > 0 && p.y < H + 2)
}

// ── Dessin ──────────────────────────────────────────────────────────────────
function slice(img: HTMLCanvasElement, from: number, to: number, bx: number, by: number) {
  const a = Math.max(0, Math.floor(from))
  const b = Math.min(sw, Math.ceil(to))
  if (b > a) ctx!.drawImage(img, a, 0, b - a, sh, bx + a, by, b - a, sh)
}

const easeOutBack = (t: number) => {
  const c = 1.5
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/** Position (centre, en pixels du canvas) et inclinaison de chaque dos de carte. */
function cardFan(bx: number, by: number) {
  const n = Math.max(1, props.cards)
  const rise = phase.value === 'rising' || phase.value === 'done' ? Math.min(1, riseT / 700) : 0
  const r = easeOutBack(rise) * RISE
  const cx = Math.round((start + end) / 2)
  const top = TEAR_BASE + 6 - peek - r
  const step = n > 1 ? Math.min(10, 30 / (n - 1)) : 0
  const turn = n > 1 ? Math.min(0.15, 0.6 / (n - 1)) : 0
  return Array.from({ length: n }, (_, i) => {
    const k = i - (n - 1) / 2
    return {
      x: bx + cx + k * step * rise,
      y: by + top + 14 + Math.abs(k) * rise,
      rot: k * turn * rise,
      depth: Math.abs(k),
    }
  })
}

/** Fin de l'animation : image du sachet vide + position des cartes, pour que la page prenne le relais. */
function handOff(): TearResult {
  const el = canvas.value!
  const rect = el.getBoundingClientRect()
  const k = rect.width / W
  const cards = cardFan(OX, OY).map((c) => ({
    x: rect.left + c.x * k,
    y: rect.top + c.y * k,
    rot: c.rot,
  }))
  hideCards = true
  particles = []
  draw()
  const image = el.toDataURL('image/png')
  return {
    image,
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    cards,
    cardWidth: 20 * k,
  }
}

function draw() {
  const g = ctx!
  g.clearRect(0, 0, W, H)
  const idle = phase.value === 'idle'
  const bob = idle && !reduced ? Math.round(Math.sin(clock / 650)) : 0
  const jolt = shake > 0 ? (Math.random() < 0.5 ? -1 : 1) : 0
  const squash = Math.round(Math.sin(bounce * Math.PI * 3) * bounce * 3)
  const bx = OX + jolt
  const by = OY + bob + squash
  const opened = phase.value !== 'idle' && phase.value !== 'tearing'
  const f = Math.round(front)

  // Colonnes déjà déchirées.
  let t0 = 0
  let t1 = 0
  if (opened) [t0, t1] = [0, sw]
  else if (dir === 1) [t0, t1] = [0, f]
  else if (dir === -1) [t0, t1] = [f + 1, sw]

  // 1 · Paroi arrière visible dans l'ouverture
  g.fillStyle = INSIDE
  for (let x = Math.max(t0, start + 1); x < Math.min(t1, end); x++) {
    g.fillRect(bx + x, by + tearY[x]! - 2, 1, 2)
  }

  // 2 · Cartes à l'intérieur (dessinées derrière la face avant)
  if (opened && !hideCards) {
    const wiggle = phase.value === 'waiting' && !reduced ? Math.sin(clock / 90) * 0.6 : 0
    // Les cartes du bord d'abord, celle du milieu par-dessus.
    const fan = cardFan(bx, by)
    const order = fan.map((_, i) => i).sort((a, b) => fan[b]!.depth - fan[a]!.depth)
    for (const i of order) {
      const c = fan[i]!
      g.save()
      g.translate(c.x, c.y + wiggle)
      g.rotate(c.rot)
      g.drawImage(cardBack, -10, -14)
      g.restore()
    }
  }

  // 3 · Face avant du sachet
  slice(bodyFib, t0, t1, bx, by)
  if (t0 > 0) slice(bodyPlain, 0, t0, bx, by)
  if (t1 < sw) slice(bodyPlain, t1, sw, bx, by)

  // 4 · Rabat : partie encore attachée, partie déchirée qui se soulève
  if (!opened) {
    if (dir === 0) slice(flapPlain, 0, sw, bx, by)
    else {
      if (dir === 1) slice(flapPlain, f, sw, bx, by)
      else slice(flapPlain, 0, f + 1, bx, by)
      const hx = dir === 1 ? f : f + 1
      const hy = tearY[Math.min(sw - 1, Math.max(0, hx))]!
      g.save()
      g.translate(bx + hx, by + hy)
      g.rotate(dir * lift)
      g.translate(-(bx + hx), -(by + hy))
      slice(flapFib, t0, t1, bx, by)
      g.restore()
    }
  } else if (phase.value === 'flying') {
    g.save()
    g.globalAlpha = Math.max(0, flight.alpha)
    g.translate(bx + flight.hx + flight.dx, by + flight.hy + flight.dy)
    g.rotate(flight.a)
    g.translate(-(bx + flight.hx), -(by + flight.hy))
    g.drawImage(flapFib, bx, by)
    g.restore()
  }

  // 5 · Pointillés de découpe et flèches d'invitation
  if (!opened) {
    const march = Math.floor(clock / 110)
    g.fillStyle = 'rgba(27, 36, 64, 0.7)'
    for (let x = start + 1; x < end; x++) {
      const untorn = dir === 0 || (dir === 1 ? x > f : x < f)
      if (untorn && (x + march) % 4 < 2) g.fillRect(bx + x, by + tearY[x]!, 1, 1)
    }
    if (dir === 0) {
      const nudge = reduced ? 0 : Math.round((Math.sin(clock / 180) + 1) * 1.5)
      chevron(bx + start - 8 + nudge, by + tearY[start]! - 2, 1)
      chevron(bx + end + 6 - nudge, by + tearY[end]! - 2, -1)
    }
  }

  // 6 · Éclats de papier
  for (const p of particles) {
    g.globalAlpha = Math.min(1, (p.life / p.max) * 1.6)
    g.fillStyle = p.color
    g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
  }
  g.globalAlpha = 1
}

/** Petite flèche pixel « > » (direction 1) ou « < » (direction -1). */
function chevron(x: number, y: number, d: 1 | -1) {
  const g = ctx!
  g.fillStyle = INK
  for (let i = 0; i < 3; i++) {
    const px = d === 1 ? x + i : x - i
    g.fillRect(px, y + i, 1, 1)
    g.fillRect(px, y + 4 - i, 1, 1)
  }
}

function loop(now: number) {
  const f = Math.min(3, (now - (last || now)) / 16.67)
  last = now
  update(f, now)
  draw()
  if (phase.value !== 'done') raf = requestAnimationFrame(loop)
}

// ── Entrées : souris / tactile / clavier ─────────────────────────────────────
function toLogical(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  }
}

function onPointerDown(e: PointerEvent) {
  if (phase.value !== 'idle' && phase.value !== 'tearing') return
  const p = toLogical(e)
  const sx = p.x - OX
  const sy = p.y - OY
  // Zone de prise généreuse autour du haut du sachet.
  if (sx < start - 14 || sx > end + 14 || sy < -18 || sy > TEAR_BASE + 26) return
  e.preventDefault()
  canvas.value!.setPointerCapture(e.pointerId)
  dragging = true
  pointer = p
  ensureAudio()
  void audio?.resume()
  begin(sx < (start + end) / 2 ? 1 : -1)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  pointer = toLogical(e)
  const target = Math.min(end, Math.max(start, pointer.x - OX))
  frontTarget = dir === 1 ? Math.max(frontTarget, target) : Math.min(frontTarget, target)
}

function onPointerUp() {
  dragging = false
}

function onKeydown(e: KeyboardEvent) {
  if (phase.value !== 'idle' && phase.value !== 'tearing') return
  if (!['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(e.key)) return
  e.preventDefault()
  ensureAudio()
  void audio?.resume()
  begin(e.key === 'ArrowLeft' ? -1 : 1)
  advanceBy(0.2)
}

// ── Cycle de vie ─────────────────────────────────────────────────────────────
let observer: ResizeObserver | null = null

function fit() {
  const el = stage.value
  if (!el) return
  const raw = Math.min(el.clientWidth / W, el.clientHeight / H, 3)
  // Grand écran : demi-pas pour des pixels réguliers. Petit écran : toute la place disponible.
  scale.value = raw >= 2 ? Math.floor(raw * 2) / 2 : Math.max(0.5, raw)
}

onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  ctx!.imageSmoothingEnabled = false
  fit()
  observer = new ResizeObserver(fit)
  if (stage.value) observer.observe(stage.value)
  const img = new Image()
  img.onload = () => {
    prepare(img)
    phase.value = 'idle'
    raf = requestAnimationFrame(loop)
  }
  img.src = boosterUrl
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  void audio?.close()
})

const percent = computed(() => Math.round(progress.value * 100))
const status = computed(() => {
  switch (phase.value) {
    case 'idle':
    case 'loading':
      return 'Glissez le long des pointillés pour déchirer le booster.'
    case 'tearing':
      return percent.value < 60 ? 'Ça vient… continuez !' : 'Encore un petit effort !'
    case 'flying':
    case 'waiting':
      return 'Ouverture du booster…'
    default:
      return 'Voici vos cartes !'
  }
})
</script>

<template>
  <div class="relative flex min-h-0 w-full flex-col items-center gap-2">
    <div ref="stage" class="flex min-h-0 w-full flex-1 items-center justify-center">
      <div
        class="relative cursor-grab select-none focus-visible:outline-offset-4 active:cursor-grabbing"
        role="slider"
        tabindex="0"
        aria-label="Déchirer le haut du booster"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="percent"
        :aria-valuetext="`${percent} % déchiré`"
        aria-describedby="tear-help"
        @keydown="onKeydown"
      >
        <canvas
          ref="canvas"
          :width="W"
          :height="H"
          class="pixelated block touch-pan-y drop-shadow-[4px_4px_0_var(--color-ink)]"
          :style="{
            width: `${W * scale}px`,
            height: `${H * scale}px`,
            imageRendering: 'pixelated',
          }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @lostpointercapture="onPointerUp"
        />
      </div>
    </div>

    <!-- Hauteur fixe (2 lignes) : le texte qui change ne fait pas bouger le sachet -->
    <p
      id="tear-help"
      class="flex min-h-12 max-w-xs items-center text-center font-semibold"
      aria-live="polite"
    >
      {{ status }}
    </p>
    <p class="sr-only">Au clavier : flèche droite ou gauche pour déchirer.</p>

    <!-- Coin supérieur droit du cadre : bouton icône, haut-parleur barré quand le son est coupé -->
    <button
      type="button"
      class="absolute top-0 right-0 z-10 grid size-10 cursor-pointer place-items-center border-2 border-ink bg-cream shadow-[3px_3px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 active:translate-0.5 active:shadow-none"
      :aria-pressed="soundOn"
      aria-label="Son"
      :title="soundOn ? 'Couper le son' : 'Activer le son'"
      @click="soundOn = !soundOn"
    >
      <PixelIcon :name="soundOn ? 'sound' : 'sound-off'" :size="20" />
    </button>
  </div>
</template>
