const test = require('node:test')
const assert = require('node:assert/strict')

const { buildForwardFallbackMessages } = require('../lib/index.js')

test('buildForwardFallbackMessages keeps single-segment replies unchanged', () => {
  assert.deepEqual(buildForwardFallbackMessages([]), [])
  assert.deepEqual(buildForwardFallbackMessages(['只有一段']), ['只有一段'])
})

test('buildForwardFallbackMessages truncates multi-segment dump to first segment with hint', () => {
  const result = buildForwardFallbackMessages(['第一段正文', '第二段正文', '第三段正文', '第四段正文'])

  assert.equal(result.length, 1)
  assert.match(result[0], /^第一段正文\n/)
  assert.match(result[0], /合并转发发送失败/)
  assert.match(result[0], /1\/4/)
  assert.doesNotMatch(result[0], /第二段正文/)
  assert.doesNotMatch(result[0], /第四段正文/)
})
