import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

import { DESKTOP_MANIFEST_URL, useDesktopDownload } from '@/composables/useDesktopDownload'

async function probe() {
  let state!: ReturnType<typeof useDesktopDownload>
  mount(
    defineComponent({
      setup() {
        state = useDesktopDownload()
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return state.release.value
}

function serve(body: string, status = 200, type = 'application/json') {
  const fetch = vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const MANIFEST = {
  version: '0.2.0',
  date: '2026-11-13',
  demo: false,
  setup: { file: 'Creatura-Setup-0.2.0.exe', size: 121944605 },
  portable: { file: 'Creatura-0.2.0-portable.exe', size: 110950611 },
}

afterEach(() => vi.unstubAllGlobals())

describe('useDesktopDownload', () => {
  it('lit la version publiée et pointe vers ses fichiers', async () => {
    const fetch = serve(JSON.stringify(MANIFEST))
    const release = await probe()
    expect(fetch).toHaveBeenCalledWith(DESKTOP_MANIFEST_URL, expect.anything())
    expect(release).toEqual({
      version: '0.2.0',
      date: '13 novembre 2026',
      setup: { url: '/telechargements/Creatura-Setup-0.2.0.exe', size: '116 Mo' },
      portable: { url: '/telechargements/Creatura-0.2.0-portable.exe', size: '106 Mo' },
    })
  })

  it("reste masqué quand le serveur renvoie la page de l'application à la place du JSON", async () => {
    serve('<!doctype html><html></html>', 200, 'text/html')
    expect(await probe()).toBeNull()
  })

  it('reste masqué quand latest.json est absent ou incomplet', async () => {
    serve('', 404)
    expect(await probe()).toBeNull()
    serve(JSON.stringify({ version: '0.2.0' }))
    expect(await probe()).toBeNull()
  })
})
