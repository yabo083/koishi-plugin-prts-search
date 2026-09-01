// Warfarin Wiki 的聊天文本层：单页格式化 + 成批分页 + 命令错误话术
import { WarfarinWikiAnchor, WarfarinWikiApiError, WarfarinWikiContextResult, WarfarinWikiSearchResult, clampInteger, normalizeKeyword } from '../services/warfarin-wiki'
import { Config as RuntimeConfig } from '../types'
import { SelectedWikiAnchor } from './fold'

/** 相对翻页一次挪几条 = 每页条数 × 一次发几页 */
export function getWikiBatchSize(wikiConfig: RuntimeConfig['wiki']) {
  return Math.max(1, wikiConfig.pageSize) * Math.max(1, wikiConfig.initialPageCount)
}

export interface WikiBatchOptions {
  results: SelectedWikiAnchor[]
  total: number
  took_ms: number
  keyword: string
  offset: number
  pageSize: number
  pageCount: number
  commandName: string
  sourceLabel: string
  showSourceLabel: boolean
  dataUpdatedLabel?: string
}

/** 从 offset 起连出 pageCount 页文本；一条都排不出来时退回单页格式化 */
export function formatWikiSearchBatch(options: WikiBatchOptions) {
  const pageSize = Math.max(1, options.pageSize)
  const pageCount = Math.max(1, options.pageCount)
  const maxOffset = Math.min(options.offset + pageSize * pageCount, options.results.length)
  const messages: string[] = []
  for (let offset = options.offset; offset < maxOffset; offset += pageSize) {
    const text = formatWikiSearchResults({ ...options, offset })
    if (text) messages.push(text)
  }
  return messages.length ? messages : formatWikiSearchResults(options)
}

export function formatWikiCommandError(error: unknown, fallback: string) {
  if (error instanceof WarfarinWikiApiError) {
    if (error.code === 400) return `检索参数不合法：${error.message}`
    if (error.code === 404) return `没有找到这条资料：${error.message}`
  }
  return fallback
}

/** 单页检索结果：标题行给总数与翻页提示，每条正文按关键词截一段摘要 */
export function formatWikiSearchResults(result: WarfarinWikiSearchResult & { keyword: string; offset?: number; pageSize?: number; commandName?: string; sourceLabel?: string; showSourceLabel?: boolean; dataUpdatedLabel?: string }) {
  const keyword = normalizeKeyword(result.keyword)
  const commandName = result.commandName || 'w'
  const sourceLabel = result.sourceLabel || 'Warfarin Wiki 官方搜索'
  const showSourceLabel = result.showSourceLabel !== false
  const dataUpdatedLabel = String(result.dataUpdatedLabel || '').trim()
  const dataUpdatedLine = dataUpdatedLabel ? `数据更新时间：${dataUpdatedLabel}` : ''
  if (!result.results.length) return [`Warfarin Wiki 检索：${keyword}`, dataUpdatedLine, showSourceLabel ? `信息源：${sourceLabel}` : '', '没有找到相关资料。'].filter(Boolean).join('\n')
  const offset = clampInteger(result.offset, 0, 0, Math.max(0, result.results.length - 1))
  const pageSize = clampInteger(result.pageSize, 5, 1, 20)
  const visible = result.results.slice(offset, offset + pageSize)
  const total = Math.max(result.total || 0, result.results.length)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const lines = [
    `Warfarin Wiki 检索：${keyword} | 共 ${total} 条，可用页码 [1-${totalPages}] | 输入 ${commandName} 序号 查看，${commandName}+ 下一页，${commandName}- 上一页，${commandName}+页码 跳页。`,
    dataUpdatedLine,
    showSourceLabel ? `信息源：${sourceLabel}` : '',
    '',
  ].filter((line, index) => line || index === 3)

  visible.forEach((item, index) => {
    lines.push(`${offset + index + 1}. ${item.source}`)
    lines.push(`   ${excerptAroundKeyword(item.content, keyword, 110)}`)
  })
  return lines.join('\n')
}

/** 详情：元信息一行 + 可选摘要 + 逐句正文，全文为空时退回 anchor 自带内容 */
export function formatWikiContext(result: WarfarinWikiContextResult) {
  const source = result.source_ref || result.anchor.source
  const sourceParts = splitWikiSource(source)
  const missionMeta = getMissionMeta(result.anchor)
  const metadata = [`名称：${sourceParts.title}`, `类型：${sourceParts.category}`]
  if (missionMeta) metadata.push(`任务编号：${missionMeta.code}`)
  metadata.push('来源：Warfarin Wiki')
  const lines = [metadata.join(' | ')]
  if (result.summary) lines.push(`摘要：${result.summary}`)
  lines.push('', '正文：')
  for (const row of result.full_text || []) {
    const speaker = String(row.speaker || '').replace(/\{[^{}]*\}/g, '').trim() || '旁白'
    const scene = String(row.scene || '').trim()
    const text = String(row.text || '').trim()
    if (!text) continue
    if (scene && speaker !== '通讯') lines.push(`${scene} / ${speaker}：${text}`)
    else if (scene) lines.push(`${scene}：${text}`)
    else lines.push(`${speaker}：${text}`)
  }
  if (lines.at(-1) === '正文：') lines.push(result.anchor.content || '暂无正文。')
  if (result.anchor.url) lines.push('', `详情：${result.anchor.url}`)
  return lines.join('\n')
}

function compactText(text: string, maxLength: number) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized
}

function splitWikiSource(source: string) {
  const text = String(source || '').trim() || '资料'
  const index = text.indexOf('：')
  if (index < 0) return { category: '资料', title: text }
  return {
    category: text.slice(0, index).trim() || '资料',
    title: text.slice(index + 1).trim() || text,
  }
}

function getMissionMeta(anchor: Pick<WarfarinWikiAnchor, 'anchor_id' | 'scope'>) {
  if (anchor.scope !== 'missions') return undefined
  const code = String(anchor.anchor_id || '').split('_')[0].trim()
  if (!code) return undefined
  const match = code.match(/m(\d+)$/i)
  if (!match) return undefined
  return { code, index: Number(match[1]) }
}

function excerptAroundKeyword(text: string, keyword: string, maxLength: number) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const index = normalized.toLowerCase().indexOf(keyword.toLowerCase())
  if (index < 0) return compactText(normalized, maxLength)
  const half = Math.floor((maxLength - keyword.length) / 2)
  const start = Math.max(0, index - half)
  const end = Math.min(normalized.length, start + maxLength)
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end)}${end < normalized.length ? '...' : ''}`
}
