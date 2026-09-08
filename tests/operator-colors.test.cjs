const test = require('node:test')
const assert = require('node:assert/strict')
const { PNG } = require('pngjs')
const { operatorThemeColor } = require('../lib/services/operator-colors')

function image(r, g, b, alpha = 255) {
  const png = new PNG({ width: 16, height: 16 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data.set([r, g, b, alpha], i)
  }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64')
}

test('accent follows current image pixels without an operator registry', () => {
  const red = operatorThemeColor(image(180, 40, 40))
  const blue = operatorThemeColor(image(40, 40, 180))
  assert.match(red, /^#[0-9a-f]{6}$/)
  assert.match(blue, /^#[0-9a-f]{6}$/)
  assert.ok(parseInt(red.slice(1, 3), 16) > parseInt(red.slice(5, 7), 16))
  assert.ok(parseInt(blue.slice(5, 7), 16) > parseInt(blue.slice(1, 3), 16))
})

test('transparent and achromatic images retain the renderer fallback', () => {
  assert.equal(operatorThemeColor(image(180, 40, 40, 0)), '')
  assert.equal(operatorThemeColor(image(120, 120, 120)), '')
  assert.equal(operatorThemeColor(''), '')
})
