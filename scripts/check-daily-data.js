// 数据获取自检：只看 PRTS 首页给了什么，不渲染。用法：node scripts/check-daily-data.js
const puppeteer = require('E:/Codes/Koishi/koishi-app/node_modules/puppeteer-core')

const EXECUTABLE = 'C:/Users/yabo/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe'
const { EXTRACT_DAILY_SNIPPET, mapRawToDailyCard } = require('../lib/services/capture.js')

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.goto('https://prts.wiki/w/%E9%A6%96%E9%A1%B5', { waitUntil: 'networkidle2', timeout: 45000 })
  await page.waitForSelector('.mp-today', { timeout: 45000 })

  const probe = await page.evaluate(() => {
    const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim()
    const today = document.querySelector('.mp-today')
    return {
      groupTitles: Array.from(document.querySelectorAll('.mp-operators-title')).map((el) => clean(el.textContent)),
      groupCounts: Array.from(document.querySelectorAll('.mp-operators-content')).map((group) => ({
        title: clean(group.querySelector('.mp-operators-title')?.textContent),
        entries: group.querySelectorAll('a[title]').length,
        withAvatar: Array.from(group.querySelectorAll('img[id="charicon"]')).length,
        withRarity: Array.from(group.querySelectorAll('img[id="levlicon"]')).length,
      })),
      todayParagraphs: today ? Array.from(today.querySelectorAll('p')).map((p) => clean(p.textContent)) : [],
      countdowns: today ? Array.from(today.querySelectorAll('p')).filter((p) => p.querySelector('.CDScontainer')).map((p) => ({
        text: clean(p.textContent),
        epoch: Number(p.querySelector('.CDScontainer')?.getAttribute('data-time')) || 0,
      })) : [],
      stageHeadings: Array.from(document.querySelectorAll('.mp-extranav h3')).map((el) => clean(el.textContent)),
    }
  })

  const raw = await page.evaluate(EXTRACT_DAILY_SNIPPET)

  console.log('=== 首页原始结构 ===')
  console.log('干员分组：', JSON.stringify(probe.groupCounts, null, 2))
  console.log('倒计时条目：', JSON.stringify(probe.countdowns, null, 2))
  console.log('今日段落：', JSON.stringify(probe.todayParagraphs, null, 2))
  console.log('关卡小节：', probe.stageHeadings)

  console.log('\n=== 映射结果 ===')
  const card = mapRawToDailyCard(raw, { now: new Date() })
  console.log(JSON.stringify({
    dateText: card.dateText,
    weekText: card.weekText,
    capturedAtText: card.capturedAtText,
    collectMaterial: card.collectMaterial,
    collectChips: card.collectChips,
    core: card.core,
    birthdays: card.birthdays.map((item) => ({ name: item.name, avatar: item.avatar ? 'ok' : 'MISSING' })),
    recentOperators: card.recentOperators.map((item) => ({ ...item, avatar: item.avatar ? 'ok' : 'MISSING' })),
    poolOperators: card.poolOperators.map((item) => ({ ...item, avatar: item.avatar ? 'ok' : 'MISSING' })),
    stageLine: card.stageLine,
  }, null, 2))

  await browser.close()
}

main().catch((error) => { console.error('CHECK FAIL:', error); process.exit(1) })
