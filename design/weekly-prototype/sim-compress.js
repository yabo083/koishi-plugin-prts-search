// 模拟群聊二压：缩到指定宽度再存成 JPEG q45，用来检查字重是否还读得清
// 用法：node sim-compress.js qa-weekly-multi.png [目标宽度=410]
const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('E:/Codes/Koishi/koishi-app/node_modules/puppeteer-core')

const EXECUTABLE = 'C:/Users/yabo/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe'
const TARGET_WIDTH = Number(process.argv[3]) || 410
const QUALITY = 45

async function main() {
  const file = process.argv[2] || 'qa-weekly-multi.png'
  const src = path.join(__dirname, file)
  const buffer = fs.readFileSync(src)
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const scale = TARGET_WIDTH / width
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: Math.round(width * scale), height: Math.round(height * scale), deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0"><img src="data:image/png;base64,${buffer.toString('base64')}"
    style="display:block;width:${Math.round(width * scale)}px"></body>`)
  await page.waitForFunction(() => document.images[0] && document.images[0].complete)
  const out = path.join(__dirname, `sim-${path.basename(file, '.png')}.jpg`)
  fs.writeFileSync(out, await page.screenshot({ type: 'jpeg', quality: QUALITY, fullPage: true }))
  console.log('written', out, `${Math.round(width * scale)}x${Math.round(height * scale)}, q${QUALITY}`)
  await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
