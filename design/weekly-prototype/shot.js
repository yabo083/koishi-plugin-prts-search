// 原型截图：node shot.js [页面] [查询串...]
//   node shot.js weekly.html multi solo none
//   node shot.js weekly.html "case=multi&week=1"
const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('E:/Codes/Koishi/koishi-app/node_modules/puppeteer-core')

const EXECUTABLE = 'C:/Users/yabo/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe'
const page$ = process.argv[2] || 'weekly.html'
const cases = process.argv.slice(3)

const slug = (query) => query.replace(/[^\w=&-]/g, '').replace(/[=&]/g, '-')

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--allow-file-access-from-files'],
  })
  for (const name of cases.length ? cases : ['']) {
    const query = name && !name.includes('=') ? `case=${name}` : name
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 1 })
    const url = 'file:///' + path.join(__dirname, page$).replace(/\\/g, '/') + (query ? `?${query}` : '')
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    await page.evaluate(() => document.fonts && document.fonts.ready)
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete)).catch(() => {})
    await new Promise((r) => setTimeout(r, 2200))
    const target = await page.$('#letter')
    const out = path.join(__dirname, `qa-${path.basename(page$, '.html')}${query ? '-' + slug(query) : ''}.png`)
    if (target) {
      fs.writeFileSync(out, await target.screenshot({ type: 'png' }))
      const box = await target.boundingBox()
      console.log('written', out, `${Math.round(box.width)}x${Math.round(box.height)}`)
    } else {
      // 没有 #letter 的页面（如画廊）整页截
      fs.writeFileSync(out, await page.screenshot({ type: 'png', fullPage: true }))
      console.log('written', out, '(full page)')
    }
    await page.close()
  }
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
