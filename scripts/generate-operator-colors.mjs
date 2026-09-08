#!/usr/bin/env node
// 干员主题色表生成器：抓 PRTS 全干员半身像 → 主色提取 → assets/operator-colors.json
//
// PRTS 没有现成的干员主题色数据（干员页 wikitext 只有皮肤「时装N颜色」），
// 所以走图片主色提取：色相 36 桶饱和度加权投票，胜出桶内平均色再做 HSB 规范化，
// 拉到适合深底强调色的区间。名单来自 MediaWiki 干员导航分类，立绘走半身像 allimages。
//
// 用法：node scripts/generate-operator-colors.mjs [--limit N] [--only 名1,名2]
// 产物：assets/operator-colors.json（{ "干员名": "#rrggbb", ... }，按名排序）

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const OUT_FILE = path.join(ROOT, 'assets', 'operator-colors.json')
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const RATE_MS = Math.max(300, Number(process.env.COLORS_RATE_MS || 700))
const args = process.argv.slice(2)
const argOf = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const limit = Number(argOf('--limit') || 0)
const only = argOf('--only') ? argOf('--only').split(',') : null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts)

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set CHROME_PATH)`)
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setUserAgent(UA)

  const fetchJson = async (url) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        const text = await page.evaluate(() => document.body.innerText)
        return JSON.parse(text)
      } catch (error) {
        if (attempt === 3) throw error
        await sleep(2000 * attempt)
      }
    }
  }

  // 1) 名单：Category:干员（PRTS 干员导航分类），排除头图/皮肤等子页
  log('fetching operator list from Category:干员 ...')
  const names = []
  let continueToken = ''
  do {
    const url = 'https://prts.wiki/api.php?action=query&list=categorymembers&cmtitle='
      + encodeURIComponent('Category:干员') + '&cmtype=page&cmlimit=500&format=json&formatversion=2'
      + (continueToken ? `&cmcontinue=${encodeURIComponent(continueToken)}` : '')
    const payload = await fetchJson(url)
    for (const member of payload.query?.categorymembers || []) {
      const title = String(member.title || '')
      if (!title.includes('/') && !/(一览|详表|对照)/.test(title)) names.push(title)
    }
    continueToken = payload.continue?.cmcontinue || ''
  } while (continueToken)
  const filtered = [...new Set(only || names)].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  log(`operator list: ${names.length} raw → ${filtered.length} to process`)

  // 2) 逐个取半身像直链并下载为 raw 像素
  const colors = {}
  const existing = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : {}
  if (!only) Object.assign(colors, existing)
  let done = 0
  let failed = 0
  for (const name of filtered) {
    done += 1
    if (!only && colors[name]) continue
    try {
      const api = 'https://prts.wiki/api.php?action=query&list=allimages&aiprefix='
        + encodeURIComponent(`半身像_${name}`) + '&ailimit=10&format=json&formatversion=2'
      const payload = await fetchJson(api)
      const images = (payload.query?.allimages || []).filter((image) => decodeURIComponent(image.name).startsWith('半身像_'))
      const pick = images.find((image) => /_1\.png$/i.test(image.name)) || images[0]
      if (!pick) throw new Error('no half-body art')
      const color = await page.evaluate(async (src) => {
        const response = await fetch(src, { headers: { Referer: 'https://prts.wiki/' } })
        const buffer = new Uint8Array(await response.arrayBuffer())
        let binary = ''
        for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000))
        return 'data:image/png;base64,' + btoa(binary)
      }, pick.url)
      const png = PNG.sync.read(Buffer.from(String(color).split(',')[1], 'base64'))
      const extracted = dominantColor(png)
      if (extracted) {
        colors[name] = extracted
      } else {
        throw new Error('no chromatic pixels')
      }
    } catch (error) {
      failed += 1
      log(`FAIL ${name}: ${error.message}`)
    }
    if (done % 10 === 0 || done === filtered.length) {
      log(`progress ${done}/${filtered.length} failed=${failed}`)
      fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
      const sorted = Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN')))
      fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 1) + '\n', 'utf8')
    }
    if (limit && done >= limit) break
    await sleep(RATE_MS)
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  const sorted = Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN')))
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 1) + '\n', 'utf8')
  log(`done: ${Object.keys(sorted).length} colors → ${path.relative(process.cwd(), OUT_FILE)} (failed ${failed})`)
  await browser.close()
}

/** 色相 36 桶饱和度平方加权投票 → 胜出桶平均色 → HSB 规范化到强调色区间 */
function dominantColor(png) {
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

function hsvToHex(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rgb
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return '#' + to(rgb[0]) + to(rgb[1]) + to(rgb[2])
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
