/**
 * Œuf pixel-art généré en SVG : illustration provisoire des créatures qui n'ont pas encore de dessin.
 * o = contour, f = remplissage, s = tache, h = reflet.
 */
const EGG = [
  '....oooo....',
  '...offffo...',
  '..offhfffo..',
  '..ofhffffo..',
  '.offhffsffo.',
  '.offffssffo.',
  'offssffffffo',
  'offssffffsfo',
  'offffffffffo',
  'offffssffffo',
  'offsfssffffo',
  '.offffffffo.',
  '.offffsfffo.',
  '..offffffo..',
  '...oooooo...',
]

export function eggDataUri(fill: string, spot: string): string {
  const colors: Record<string, string> = { o: '#25334b', f: fill, s: spot, h: '#fff7e7' }
  const rects: string[] = []
  EGG.forEach((row, y) => {
    ;[...row].forEach((cell, x) => {
      const color = colors[cell]
      if (color)
        rects.push(`<rect x="${x + 2}" y="${y + 1}" width="1" height="1" fill="${color}"/>`)
    })
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 17" shape-rendering="crispEdges">${rects.join('')}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
