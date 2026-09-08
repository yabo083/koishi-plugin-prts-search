// 干员主题色表：scripts/generate-operator-colors.mjs 从半身立绘主色提取生成，
// 随包分发。运行时只读不写；查不到的名字返回空串，由渲染器走各自的兜底色。
import fs from 'node:fs'
import path from 'node:path'

let cached: Record<string, string> | null = null

export function loadOperatorColors(): Record<string, string> {
  if (cached) return cached
  try {
    const file = path.join(__dirname, '..', '..', 'assets', 'operator-colors.json')
    cached = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>
  } catch {
    cached = {}
  }
  return cached
}

export function operatorThemeColor(name: string): string {
  const color = loadOperatorColors()[String(name || '').trim()]
  return /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : ''
}
