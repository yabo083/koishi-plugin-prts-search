const test = require('node:test')
const assert = require('node:assert/strict')

const { foldCrossSourceDuplicates } = require('../lib/index.js')

function storyItem(overrides = {}) {
  return {
    anchor_id: 'item_glass_bottle_0',
    source: '物品信息：紫晶质瓶（另有 11 个变体）',
    content: '紫晶质瓶\n由紫晶纤维加工得来的瓶子，可用于其他材料合成。出于本身的脆性、重量、侵蚀耐受程度等方面的缺陷，紫晶质瓶在文明环带市场中已逐渐被淘汰。',
    scope: 'items',
    relevance: 100,
    sourceKind: 'story',
    ...overrides,
  }
}

function officialItem(overrides = {}) {
  return {
    anchor_id: 'item_fbottle_glass_xiranite',
    source: '材料：紫晶质瓶（另有 11 个变体）',
    content: '由紫晶纤维加工得来的瓶子，可用于其他材料合成。',
    scope: 'items',
    relevance: 13,
    sourceKind: 'wiki',
    ...overrides,
  }
}

test('foldCrossSourceDuplicates merges official and story entries for the same wiki page', () => {
  const merged = foldCrossSourceDuplicates([officialItem(), storyItem()])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].sourceKind, 'story')
  assert.match(merged[0].source, /物品信息：紫晶质瓶/)
})

test('foldCrossSourceDuplicates keeps the entry with richer content regardless of source order', () => {
  const merged = foldCrossSourceDuplicates([officialItem(), storyItem()])
  const reversed = foldCrossSourceDuplicates([storyItem(), officialItem()])

  assert.equal(merged[0].anchor_id, 'item_glass_bottle_0')
  assert.equal(reversed[0].anchor_id, 'item_glass_bottle_0')
})

test('foldCrossSourceDuplicates keeps entries that differ by scope or title', () => {
  const merged = foldCrossSourceDuplicates([
    storyItem(),
    officialItem(),
    storyItem({ anchor_id: 'sysbp_tundra_glass_bottle_1_0', source: '生产蓝图：紫晶质瓶', content: '在集成核心区域放置此蓝图后，输入紫晶矿，自动生产紫晶质瓶。' }),
    storyItem({ anchor_id: 'facility_glass_bottle_0', source: '设备信息：紫晶质瓶', scope: 'facilities', content: '紫晶质瓶生产设备。' }),
    storyItem({ anchor_id: 'item_quartz_powder_0', source: '物品信息：紫晶粉末（另有 1 个变体）', content: '紫晶纤维粉碎后的粉末。' }),
  ])

  assert.equal(merged.length, 4)
  const sources = merged.map((item) => item.source)
  assert.deepEqual(sources, [
    '物品信息：紫晶质瓶（另有 11 个变体）',
    '生产蓝图：紫晶质瓶',
    '设备信息：紫晶质瓶',
    '物品信息：紫晶粉末（另有 1 个变体）',
  ])
})

test('foldCrossSourceDuplicates prefers official entry when its content is richer', () => {
  const merged = foldCrossSourceDuplicates([
    officialItem({
      content: '很长很长的官方新版本描述：包含最新的活动信息、详细的获取途径说明、完整的合成链路以及版本更新后的数值调整记录，整体篇幅明显超过本地剧情包缓存中的旧版正文。',
    }),
    storyItem(),
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].sourceKind, 'wiki')
})
