// e2e：真实 PRTS → 提取 → 渲染 → 截图。用法：node e2e-letter-card.js [styleId]
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const puppeteer = require('E:/Codes/Koishi/koishi-app/node_modules/puppeteer-core')

const { PrtsCaptureService } = require('../lib/services/capture.js')
const { DailyImageCache } = require('../lib/services/cache.js')

const EXECUTABLE = 'C:/Users/yabo/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe'
const styleId = process.argv[2] || 'letter'

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
  })
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miyako-e2e-'))
  const fetcher = async (url, init = {}) => {
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: init.headers,
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    if (init.responseType === 'arraybuffer') return await res.arrayBuffer()
    if (init.responseType === 'text') return await res.text()
    return await res.json()
  }
  const logger = {
    info: (m) => console.log('[I]', m),
    warn: (m) => console.log('[W]', m),
    debug: (m) => console.log('[D]', m),
  }
  const ctx = {
    baseDir,
    puppeteer: {
      async page() {
        return browser.newPage()
      },
    },
  }
  const cache = new DailyImageCache(baseDir, 'data/miyako-intel/cache', 'Asia/Shanghai', 4)
  const service = new PrtsCaptureService(ctx, cache, logger, { refreshCron: '5 4 * * *', fetcher, styleId })

  const result = await service.getDailyInfo(true)
  const outFile = path.join(__dirname, '..', `letter-e2e-${styleId}.png`)
  fs.writeFileSync(outFile, result.buffer)
  console.log('style:', styleId, '| dayKey:', result.dayKey, '| size:', result.buffer.byteLength, 'B')
  console.log('written:', outFile)
  await browser.close()
}

main().catch((error) => {
  console.error('E2E FAIL:', error)
  process.exit(1)
})
