const assert = require('node:assert/strict')
const test = require('node:test')

const {
  compressStageCodes,
  formatRemainingText,
  mapRawToDailyCard,
  parseCoreItem,
  splitCollectValues,
} = require('../lib/services/capture.js')
const { renderCardHtml } = require('../lib/services/card-template.js')

const NOW = new Date('2026-08-30T12:00:00+08:00')

const RAW_FIXTURE = {
  groups: [
    {
      title: '今天生日',
      entries: [
        { name: '火龙S黑角', avatar: 'https://media.prts.wiki/avatar1.png', rarity: 5 },
        { name: '特克诺', avatar: '', rarity: 5 },
      ],
    },
    {
      title: '近期新增',
      entries: [
        { name: '珊比', avatar: '', rarity: 6 },
        { name: '时隙', avatar: '', rarity: 5 },
      ],
    },
    {
      title: '凭证兑换',
      entries: [
        { name: '提丰', avatar: '', rarity: 6 },
        { name: '卡池一览', avatar: '', rarity: 0 },
      ],
    },
    {
      title: '中坚甄选',
      entries: [{ name: '云迹', avatar: '', rarity: 4 }],
    },
  ],
  todayParagraphs: [
    '现在时间：8月30日(星期六) 20:00。',
    '今日资源收集物资筹备分区：作战记录 / 采购凭证 / 龙门币 / 技巧概要芯片搜索分区：医疗&重装 / 近卫&特种 / 先锋&辅助 职业芯片(组)',
  ],
  coreItems: [
    { text: '剿灭作战 & 周常任务（含特勤任务）将于7小时17分钟后刷新。', epoch: Math.floor(NOW.getTime() / 1000) + 7 * 3600 + 17 * 60 },
    { text: '活动『墟·复刻』将于1天7小时16分钟后结束。', epoch: Math.floor(NOW.getTime() / 1000) + 31 * 3600 },
    { text: '已过期的活动将于1小时前结束。', epoch: Math.floor(NOW.getTime() / 1000) - 3600 },
  ],
  stageBlocks: [
    {
      title: '新增关卡',
      intro: ['SideStory 「直到大地变成一颗酸橙」', '踏上归家长途'],
      codes: ['TO-EX-1 电影防沉迷', 'TO-EX-2 邮包流水线', 'TO-EX-3 地下捉迷藏', 'TO-EX-8 有袋鼷兽奇遇', 'TO-S-1 邮箱保卫战', 'TO-S-4 “家族聚会”', 'TO-MO-1 大涌泉镇盛宴', 'EE-01 奇象收录时间！', 'EE-02 奇象收录时间！'],
    },
  ],
}

test('mapRawToDailyCard builds the letter card data from raw homepage extract', () => {
  const card = mapRawToDailyCard(RAW_FIXTURE, { now: NOW })

  assert.equal(card.dateText, '8月30日')
  assert.equal(card.weekText, '星期日')
  assert.deepEqual(card.collectMaterial, ['作战记录', '采购凭证', '龙门币', '技巧概要'])
  assert.deepEqual(card.collectChips, ['医疗&重装', '近卫&特种', '先锋&辅助 职业芯片(组)'])

  assert.equal(card.core.length, 2)
  assert.equal(card.core[0].name, '剿灭作战 & 周常任务（含特勤任务）')
  assert.equal(card.core[0].action, '刷新')
  assert.equal(card.core[0].remainingText, '7小时17分钟')
  assert.equal(card.core[0].urgency, 'danger')
  assert.equal(card.core[1].remainingText, '1天7小时')
  assert.equal(card.core[1].urgency, 'warn')

  assert.deepEqual(card.birthdays.map((item) => item.name), ['火龙S黑角', '特克诺'])
  assert.equal(card.birthdays[0].art, '')
  assert.equal(card.recentOperators.length, 2)
  assert.equal(card.recentOperators[0].rarity, 6)
  assert.deepEqual(card.poolOperators.map((item) => item.name), ['提丰', '云迹'])
  assert.match(card.stageLine, /SideStory 「直到大地变成一颗酸橙」/)
  assert.match(card.stageLine, /TO-EX-1、TO-EX-2、TO-EX-3、TO-EX-8/)
})

test('compressStageCodes keeps leading zeros and merges contiguous codes', () => {
  assert.equal(compressStageCodes(['TO-EX-1', 'TO-EX-2', 'TO-EX-8']), 'TO-EX-1、TO-EX-2、TO-EX-8')
  assert.equal(compressStageCodes(['EE-01 奇象收录时间！'.split(' ')[0], 'EE-02', 'EE-03']), 'EE-01 ~ EE-03')
  assert.equal(compressStageCodes(['TO-S-1', 'TO-S-4', 'TO-MO-1']), 'TO-S-1、TO-S-4 / TO-MO-1')
})

test('parseCoreItem rejects expired or malformed entries', () => {
  assert.equal(parseCoreItem('活动将于后结束。', 0, NOW), null)
  assert.equal(parseCoreItem('没有倒计时格式。', Math.floor(NOW.getTime() / 1000), NOW), null)
  const item = parseCoreItem('限时寻访『联合行动23』将于5分钟后结束。', Math.floor(NOW.getTime() / 1000) + 5 * 60, NOW)
  const unfilled = parseCoreItem('活动将于后结束。', Math.floor(NOW.getTime() / 1000) + 3600, NOW)
  assert.equal(unfilled?.name, '活动')
  assert.equal(unfilled?.action, '结束')
  assert.equal(item?.name, '限时寻访『联合行动23』')
  assert.equal(item?.remainingText, '5分钟')
})

test('formatRemainingText humanizes remaining time', () => {
  assert.equal(formatRemainingText(7 * 3600000 + 17 * 60000), '7小时17分钟')
  assert.equal(formatRemainingText(31 * 3600000), '1天7小时')
  assert.equal(formatRemainingText(30 * 1000), '1分钟')
})

test('splitCollectValues splits slash separated resource lists', () => {
  assert.deepEqual(splitCollectValues('作战记录 / 采购凭证 / 龙门币'), ['作战记录', '采购凭证', '龙门币'])
  assert.deepEqual(splitCollectValues('医疗&重装'), ['医疗&重装'])
})

test('renderCardHtml embeds stamp, chips groups and card data', () => {
  const card = mapRawToDailyCard(RAW_FIXTURE, { now: NOW })
  card.birthdays[0].art = 'data:image/png;base64,AAAA'
  const html = renderCardHtml(card, { fontsCssLinks: '<link rel="stylesheet" href="./fonts/lxgw/lxgwwenkailite-regular.css">' })

  assert.match(html, /id="letter"/)
  assert.match(html, /class="stamp-item"/)
  assert.match(html, /田字格|rough-stamp/)
  assert.match(html, /fonts\/lxgw\/lxgwwenkailite-regular\.css/)
  assert.match(html, /data-group="recent"/)
  assert.match(html, /今日资源收集，别忘了刷一遍/)
  assert.match(html, /7小时17分钟后/)
  assert.match(html, /data:image\/png;base64,AAAA/)
  const cardData = html.match(/window\.CARD_DATA = (\{[\s\S]*?\});</)
  assert.ok(cardData, 'CARD_DATA should be embedded')
  const parsed = JSON.parse(cardData[1])
  assert.equal(parsed.birthdays.length, 2)
  assert.equal(parsed.recentOperators[0].rarity, 6)
})

test('renderCardHtml omits font links when font assets are missing', () => {
  const html = renderCardHtml(mapRawToDailyCard(RAW_FIXTURE, { now: NOW }), { fontsCssLinks: '' })
  assert.doesNotMatch(html, /fonts\/lxgw/)
})
