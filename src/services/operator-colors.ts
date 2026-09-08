import { Logger } from 'koishi'

const { PNG } = require('pngjs') as { PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } } }
const logger = new Logger('miyako-intel')

/** 从本次渲染的 PNG 立绘提取强调色，不依赖干员名单或持久色表。 */
export function operatorThemeColor(image: string): string {
  if (!image) return ''
  const match = /^data:image\/png;base64,(.+)$/s.exec(image)
  if (!match) return ''
  try {
    return dominantColor(PNG.sync.read(Buffer.from(match[1], 'base64'))) || ''
  } catch (error) {
    logger.warn('生日立绘取色失败，使用星期色：%s', error instanceof Error ? error.message : String(error))
    return ''
  }
}

/** 色相 36 桶饱和度平方加权投票 → 胜出桶平均色 → HSB 规范化到强调色区间 */
function dominantColor(png: { width: number; height: number; data: Buffer }): string | null {
  const BUCKETS = 36
  const buckets = Array.from({ length: BUCKETS }, () => ({ w: 0, r: 0, g: 0, b: 0 }))
  const step = Math.max(1, Math.floor(Math.min(png.width, png.height) / 160))
  const topLimit = Math.floor(png.height * 0.85)
  for (let y = 0; y < topLimit; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const i = (png.width * y + x) << 2
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3]
      if (a < 200) continue
      const rn = r / 255, gn = g / 255, bn = b / 255
      const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
      const v = max, s = max ? (max - min) / max : 0
      if (v < 0.2 || v > 0.95 || s < 0.18) continue
      let h = 0
      const d = max - min
      if (d) {
        h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
        h *= 60
      }
      const bucket = buckets[Math.floor(h / (360 / BUCKETS)) % BUCKETS]
      const w = s * s * (1 - Math.abs(v - 0.55))
      bucket.w += w
      bucket.r += r * w
      bucket.g += g * w
      bucket.b += b * w
    }
  }
  const best = buckets.reduce((a, b) => (b.w > a.w ? b : a), buckets[0])
  if (best.w < 1) return null
  const rn = best.r / best.w / 255, gn = best.g / best.w / 255, bn = best.b / best.w / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d) {
    h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
    h *= 60
  }
  const s = max ? d / max : 0
  const v = Math.min(0.85, Math.max(0.5, max * 1.1))
  const s2 = Math.min(1, Math.max(0.55, s * 1.15))
  return hsvToHex(h, s2, v)
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rgb: number[]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return '#' + to(rgb[0]) + to(rgb[1]) + to(rgb[2])
}
