import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

import { ANDROID_MANIFEST_URL, useAndroidDownload } from '@/composables/useAndroidDownload'

async function probe() {
  let state!: ReturnType<typeof useAndroidDownload>
  mount(
    defineComponent({
      setup() {
        state = useAndroidDownload()
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return state.release.value
}

async function probeOffered() {
  let state!: ReturnType<typeof useAndroidDownload>
  mount(
    defineComponent({
      setup() {
        state = useAndroidDownload()
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return state.offered
}

function serve(body: string, status = 200, type = 'application/json') {
  const fetch = vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const MANIFEST = {
  version: '0.1.0',
  date: '2026-11-16',
  minAndroid: '8.0',
  apk: { file: 'Creatura-0.1.0.apk', size: 15728640 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAndroidDownload', () => {
  it("lit la version publiée et pointe vers l'APK", async () => {
    const fetch = serve(JSON.stringify(MANIFEST))
    const release = await probe()
    expect(fetch).toHaveBeenCalledWith(ANDROID_MANIFEST_URL, expect.anything())
    expect(release).toEqual({
      version: '0.1.0',
      date: '16 novembre 2026',
      minAndroid: '8.0',
      apk: { url: '/telechargements/Creatura-0.1.0.apk', size: '15 Mo' },
    })
  })

  it('accepte un manifeste sans date ni version minimale', async () => {
    serve(JSON.stringify({ version: '0.1.0', apk: MANIFEST.apk }))
    expect(await probe()).toMatchObject({ date: null, minAndroid: null })
  })

  it("reste masqué quand le serveur renvoie la page de l'application à la place du JSON", async () => {
    serve('<!doctype html><html></html>', 200, 'text/html')
    expect(await probe()).toBeNull()
  })

  it('reste masqué quand android.json est absent ou incomplet', async () => {
    serve('', 404)
    expect(await probe()).toBeNull()
    serve(JSON.stringify({ version: '0.1.0' }))
    expect(await probe()).toBeNull()
  })

  it("ne propose pas l'APK depuis l'application Android elle-même", async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    )
    const fetch = serve(JSON.stringify(MANIFEST))
    expect(await probe()).toBeNull()
    expect(await probeOffered()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})
