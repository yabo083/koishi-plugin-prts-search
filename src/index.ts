import { Context, Schema } from 'koishi'
import { resolve } from 'node:path'
import { Config as RuntimeConfig } from './types'
import { DailyImageCache, getPrtsDayKey, getZonedParts } from './services/cache'
import { DEFAULT_CACHE_MAINTENANCE, PrtsCaptureService } from './services/capture'
import { matchesCronExpression } from './services/cron'
import { WarfarinWikiAnchor, WarfarinWikiApiError, WarfarinWikiClient, defaultUserAgent, formatWikiContext, formatWikiSearchResults } from './services/warfarin-wiki'
import { WarfarinStorySearchService } from './services/warfarin-story-search'

export { getPrtsDayKey }
export type { Config as ArknightsIntelConfig } from './types'

export const name = 'miyako-intel'
export const inject = { optional: ['puppeteer', 'console', 'database'] as const }

const TIMEZONE = 'Asia/Shanghai'
const DAY_REFRESH_HOUR = 4

export const usage = `
<p><strong>每日情报信笺</strong></p>
<ul>
  <li>每天自动抓取 PRTS 首页并渲染「今日信笺」卡片图（资源收集、核心动态、生日干员贴画、近期新增）。</li>
  <li><code>refreshCron</code> 为后台刷新时间，<code>scheduledPush.cron</code> 为推送时间，格式均为 <code>分钟 小时 日期 月份 星期</code>。</li>
  <li>推送目标 <code>scheduledPush.channels</code> 填 Koishi 频道 ID，OneBot/NapCat 群示例：<code>onebot:11111111</code>。</li>
  <li>关闭「每日情报卡片」开关后不抓取、不推送。</li>
</ul>
<p><strong>Warfarin 检索</strong>：<code>w 息壤</code> 检索；<code>w 1</code> 查看结果，<code>w+</code> 翻页，<code>w+2</code> 跳页；<code>wn 321</code> 强制搜索纯数字关键词。</p>
`

const cronDescription = [
  'cron 格式：`分钟 小时 日期 月份 星期`，按东八区生效。',
  '例：`5 4 * * *` = 每天 04:05；`*/30 * * * *` = 每 30 分钟一次。',
].join('\n')

const storyScopes = ['missions']
const defaultStoryBundleManifestUrl = 'https://github.com/yabo083/koishi-plugin-miyako-intel/releases/download/warfarin-story-latest/warfarin-story-cn.manifest.json'
type WikiSearchSource = 'wiki' | 'story'
type SelectedWikiAnchor = WarfarinWikiAnchor & { sourceKind?: WikiSearchSource }
type WikiReplyPayload = string | string[]

export const Config = Schema.intersect([
  Schema.object({
    dailyCardEnabled: Schema.boolean().default(true).description('每日情报信笺：关闭后不抓取、不推送。'),
    logLevel: Schema.union([
      Schema.const('silent').description('静默：不输出插件运行日志。'),
      Schema.const('warn').description('警告：只输出失败和异常。'),
      Schema.const('info').description('信息：输出加载、定时刷新、定时推送结果。'),
      Schema.const('debug').description('调试：额外输出定时任务跳过原因。'),
    ]).role('radio').default('info').description('插件日志等级。'),
  }).description('基础设置'),
  Schema.object({
    refreshCron: Schema.string().default('5 4 * * *').description(`每日卡片后台刷新时间。\n${cronDescription}`),
    scheduledPush: Schema.object({
      enabled: Schema.boolean().default(false).description('是否启用定时推送。'),
      channels: Schema.array(String).default([]).description('推送目标频道。OneBot/NapCat 群示例：onebot:11111111；多群点“添加项目”。'),
      cron: Schema.string().default('10 8 * * *').description(`推送触发时间。\n${cronDescription}`),
    }).description('定时推送设置'),
  }).description('定时任务'),
  Schema.object({
    wiki: Schema.object({
      language: Schema.string().default('cn').description('资料语言。'),
      storySearchEnabled: Schema.boolean().default(true).description('是否启用剧情/任务全文搜索。'),
      storyUpdateCron: Schema.string().default('20 4 * * *').description('剧情数据自动更新时间。'),
      storyUpdateOnStart: Schema.boolean().default(false).description('插件启动时是否立即更新剧情数据。'),
      storyBundleManifestUrl: Schema.string().default(defaultStoryBundleManifestUrl).description('远程压缩剧情文本合集 manifest 地址。留空则只使用随包种子和已有本地缓存，不访问 Warfarin 源站。'),
      timeoutMs: Schema.number().min(1000).max(60000).default(10000).description('资料请求超时时间。'),
      searchCacheTtlMs: Schema.number().min(0).max(86400000).default(600000).description('搜索结果缓存时间，单位毫秒。'),
      searchCacheMaxEntries: Schema.number().min(1).max(1000).default(100).description('搜索缓存最大数量。'),
      pageSize: Schema.number().min(1).max(10).default(5).description('每页显示结果数。'),
      initialPageCount: Schema.number().min(1).max(10).default(5).description('首次关键词检索和 w+ / w- 相对翻页时一次发送多少页。'),
      selectionTtlMs: Schema.number().min(30000).max(3600000).default(300000).description('编号选择保留时间，单位毫秒。'),
      groupForwardEnabled: Schema.boolean().default(false).description('群聊中是否将 Warfarin 查询回复作为 OneBot/NapCat 合并转发发送。失败时自动回退普通文本。'),
      groupForwardNodeLineLimit: Schema.number().min(3).max(80).default(20).description('合并转发每个节点最多包含多少行文本。'),
      groupForwardSenderName: Schema.string().default('Warfarin Wiki').description('合并转发节点显示昵称。'),
      groupForwardSenderUin: Schema.string().default('2854196310').description('合并转发节点显示 QQ 号。'),
    }).description('Warfarin 资料检索'),
  }).description('Warfarin 资料检索'),
]) as Schema<RuntimeConfig>

declare module 'koishi' {
  interface Context {
    puppeteer?: {
      page: () => Promise<any>
    }
    console?: {
      addEntry: (entry: { dev: string; prod: string }) => void
      addListener?: (name: string, listener: (...args: any[]) => any) => void
    }
  }
}

export function apply(ctx: Context, config: RuntimeConfig) {
  const resolved = resolveConfig(config)
  const logger = createScopedLogger(ctx.logger(name), resolved.logLevel)
  const nowProvider = () => resolved.now ? new Date(resolved.now) : new Date()
  const cache = new DailyImageCache(ctx.baseDir, 'data/miyako-intel/cache', 'Asia/Shanghai', 4, nowProvider)
  const service = new PrtsCaptureService(ctx, cache, logger, { refreshCron: resolved.refreshCron, nowProvider })
  const wikiClient = new WarfarinWikiClient({ baseUrl: resolved.wiki.baseUrl, mode: resolved.wiki.mode, language: resolved.wiki.language, userAgent: resolved.wiki.userAgent, timeoutMs: resolved.wiki.timeoutMs, fetch: createKoishiHttpFetch(ctx.http, resolved.wiki.timeoutMs) })
  const storyClient = new WarfarinWikiClient({ baseUrl: resolved.wiki.storyBaseUrl, mode: 'story', language: resolved.wiki.storyLanguage, scopes: storyScopes, pageBaseUrl: '', userAgent: resolved.wiki.userAgent, timeoutMs: resolved.wiki.timeoutMs, fetch: createKoishiHttpFetch(ctx.http, resolved.wiki.timeoutMs) })
  const storySearch = new WarfarinStorySearchService({ baseDir: ctx.baseDir, dataDirectory: resolved.wiki.storyDataDirectory, language: resolved.wiki.storyLanguage, timeoutMs: resolved.wiki.timeoutMs, bundleManifestUrl: resolved.wiki.storyBundleManifestUrl, fetch: createKoishiHttpFetch(ctx.http, resolved.wiki.timeoutMs) })
  const wikiSelections = new Map<string, { expiresAt: number; keyword: string; offset: number; total: number; results: SelectedWikiAnchor[]; dataUpdatedLabel?: string }>()
  const wikiSearchCache = new Map<string, { expiresAt: number; result: { results: WarfarinWikiAnchor[]; total: number; took_ms: number } }>()
  const storySearchCache = new Map<string, { expiresAt: number; result: { results: WarfarinWikiAnchor[]; total: number; took_ms: number } }>()
  let lastPushedDayKey = ''
  let lastMaintainedDayKey = ''
  let lastStoryUpdatedDayKey = ''
  let backgroundRunning = false
  let storyUpdating = false

  ctx.console?.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })
  ctx.console?.addListener?.('miyako-intel/status', buildConsoleStatus)
  ctx.console?.addListener?.('miyako-intel/update-story', runManualStoryUpdate)
  if (resolved.wiki.storySearchEnabled) {
    storySearch.load().catch((error) => logger.warn(`加载本地剧情文本失败：${formatError(error)}`))
    if (resolved.wiki.storyUpdateOnStart) runStoryUpdate('启动更新')
  }

  ctx.command('w <input:text>', '检索 Warfarin Wiki 终末地资料')
    .action(async ({ session }, input?: string) => sendWikiReply(session, () => handleWikiInput(session, input || '')))

  ctx.command('wn <input:text>', '按关键词检索 Warfarin Wiki，纯数字也按搜索处理')
    .action(async ({ session }, input?: string) => sendWikiReply(session, () => searchWiki(session, input || '')))

  ctx.command('w+', '显示下一页 Warfarin Wiki 检索结果')
    .action(async ({ session }) => sendWikiReply(session, () => pageWiki(session, 1)))

  ctx.command('w+<page:number>', '跳转到指定页 Warfarin Wiki 检索结果')
    .action(async ({ session }, page?: number) => sendWikiReply(session, () => pageWikiPage(session, page)))

  ctx.command('w-', '显示上一页 Warfarin Wiki 检索结果')
    .action(async ({ session }) => sendWikiReply(session, () => pageWiki(session, -1)))

  ctx.middleware(async (session, next) => {
    const content = String(session?.stripped?.content ?? session?.content ?? '').trim()
    const match = content.match(/^w\+([1-9]\d*)$/)
    if (!match) return next()
    const text = await pageWikiPage(session, Number(match[1]))
    const fallback = text ? await sendWikiText(session, text) : ''
    if (fallback) await session.send(fallback)
  })

  ctx.setInterval(() => {
    return runBackgroundJobs()
  }, 60 * 1000)

  logger.info(`Miyako 游戏情报插件已加载。日报刷新 ${resolved.dailyCardEnabled ? resolved.refreshCron : '关闭'}；推送 ${resolved.scheduledPush.enabled ? resolved.scheduledPush.cron : '关闭'}。`)

  async function runBackgroundJobs() {
    if (backgroundRunning) return
    backgroundRunning = true
    try {
      if (resolved.dailyCardEnabled) {
        await service.refreshDue()
        await runScheduledPushIfDue()
        await runCacheMaintenanceIfDue()
      }
      await runStoryUpdateIfDue()
    } finally {
      backgroundRunning = false
    }
  }

  async function runCacheMaintenanceIfDue() {
    const maintenance = DEFAULT_CACHE_MAINTENANCE

    const now = new Date()
    const parts = getZonedParts(now, TIMEZONE)
    if (!matchesCronExpression(maintenance.archiveCron, parts)) {
      logger.debug(`缓存维护未到触发时间：${maintenance.archiveCron}`)
      return
    }

    const dayKey = getPrtsDayKey(now, TIMEZONE, DAY_REFRESH_HOUR)
    if (dayKey === lastMaintainedDayKey) {
      logger.debug(`缓存维护跳过：${dayKey} 已维护。`)
      return
    }

    try {
      const report = await cache.maintain(maintenance)
      lastMaintainedDayKey = dayKey
      logger.info(`缓存维护完成：保留 ${report.keptDayKeys.length} 天，归档 ${report.archivedDayKeys.length} 天，删除 ${report.deletedDayKeys.length} 天。`)
    } catch (error) {
      logger.warn(`缓存维护失败：${formatError(error)}`)
    }
  }

  async function runStoryUpdateIfDue() {
    if (!resolved.wiki.storySearchEnabled) return
    const now = new Date()
    const parts = getZonedParts(now, TIMEZONE)
    if (!matchesCronExpression(resolved.wiki.storyUpdateCron, parts)) return
    const dayKey = getPrtsDayKey(now, TIMEZONE, DAY_REFRESH_HOUR)
    if (dayKey === lastStoryUpdatedDayKey) return
    const ok = await runStoryUpdate('定时更新')
    if (ok) lastStoryUpdatedDayKey = dayKey
  }

  async function handleWikiInput(session: any, input: string) {
    const normalized = String(input || '').trim()
    if (!normalized) return '请输入关键词，例如：w 息壤'
    if (/^\d+$/.test(normalized)) {
      if (wikiSelections.has(getWikiSelectionKey(session))) return showWikiContext(session, normalized)
    }
    if (normalized === '+' || normalized === '下一页') return pageWiki(session, 1)
    if (normalized === '-' || normalized === '上一页') return pageWiki(session, -1)
    const shortcut = parseWikiShortcut(normalized)
    if (shortcut) {
      await searchWiki(session, shortcut.keyword)
      return showWikiContext(session, String(shortcut.index))
    }
    return searchWiki(session, normalized)
  }

  async function searchWiki(session: any, keyword: string, source: WikiSearchSource = 'wiki') {
    if (!session) return '只能在会话中使用该命令。'
    const normalizedKeyword = String(keyword || '').trim()
    if (!normalizedKeyword) return '请输入关键词，例如：w 息壤'
    pruneWikiSelections()
    try {
      const result = source === 'story'
        ? tagWikiSearchResult(await getCachedWikiSearch(normalizedKeyword, 'story'), 'story')
        : await searchAllWikiSources(normalizedKeyword)
      const dataUpdatedLabel = await getStoryDataUpdatedLabel()
      wikiSelections.set(getWikiSelectionKey(session), { expiresAt: Date.now() + resolved.wiki.selectionTtlMs, keyword: normalizedKeyword, offset: 0, total: result.total, results: result.results, dataUpdatedLabel })
      return formatWikiSearchBatch({ ...result, keyword: normalizedKeyword, offset: 0, pageSize: resolved.wiki.pageSize, pageCount: resolved.wiki.initialPageCount, commandName: 'w', sourceLabel: '综合搜索', showSourceLabel: false, dataUpdatedLabel })
    } catch (error) {
      logger.warn(`${source === 'story' ? '剧情/任务全文' : '终末地资料'}检索失败：${formatError(error)}`)
      return formatWikiCommandError(error, source === 'story' ? '剧情/任务检索暂时不可用，请稍后重试。' : '资料检索暂时不可用，请稍后重试。')
    }
  }

  async function searchAllWikiSources(keyword: string) {
    const settled = await Promise.allSettled([
      getCachedWikiSearch(keyword, 'wiki'),
      getCachedWikiSearch(keyword, 'story'),
    ])
    const wiki = settled[0].status === 'fulfilled' ? tagWikiSearchResult(settled[0].value, 'wiki') : emptyWikiSearchResult()
    const story = settled[1].status === 'fulfilled' ? tagWikiSearchResult(settled[1].value, 'story') : emptyWikiSearchResult()
    if (settled[0].status === 'rejected' && settled[1].status === 'rejected') throw settled[0].reason
    if (settled[0].status === 'rejected') logger.warn(`Warfarin Wiki 官方搜索失败，使用剧情全文结果：${formatError(settled[0].reason)}`)
    if (settled[1].status === 'rejected') logger.warn(`剧情/任务全文搜索失败，使用官方结果：${formatError(settled[1].reason)}`)
    const results = foldCrossSourceDuplicates(dedupeWikiResults([...wiki.results, ...story.results]))
    return { results, total: results.length, took_ms: Math.max(wiki.took_ms, story.took_ms) }
  }

  async function getCachedWikiSearch(keyword: string, source: WikiSearchSource = 'wiki') {
    const key = source === 'story' ? `story:${resolved.wiki.storyBaseUrl}:${storyScopes.join(',')}:${keyword}` : `${resolved.wiki.mode}:${resolved.wiki.baseUrl}:${keyword}`
    const searchCache = source === 'story' ? storySearchCache : wikiSearchCache
    const now = Date.now()
    if (resolved.wiki.searchCacheTtlMs > 0) {
      const cached = searchCache.get(key)
      if (cached && cached.expiresAt > now) return cached.result
      if (cached) searchCache.delete(key)
    }
    const result = await (source === 'story' ? getStorySearch(keyword) : wikiClient.search({ keyword }))
    if (resolved.wiki.searchCacheTtlMs > 0) {
      searchCache.set(key, { expiresAt: now + resolved.wiki.searchCacheTtlMs, result })
      pruneWikiSearchCache(searchCache)
    }
    return result
  }

  async function getStorySearch(keyword: string) {
    if (resolved.wiki.storySearchEnabled) {
      const local = await storySearch.search({ keyword })
      if (local.results.length) return local
    }
    return storyClient.search({ keyword })
  }

  async function getStoryDataUpdatedLabel() {
    if (!resolved.wiki.storySearchEnabled) return ''
    return storySearch.getDataUpdatedLabel().catch(() => '')
  }

  function tagWikiSearchResult(result: { results: WarfarinWikiAnchor[]; total: number; took_ms: number }, source: WikiSearchSource) {
    return {
      ...result,
      results: result.results.map((item) => ({ ...item, sourceKind: source })),
    }
  }

  function emptyWikiSearchResult() {
    return { results: [] as SelectedWikiAnchor[], total: 0, took_ms: 0 }
  }

  function dedupeWikiResults(results: SelectedWikiAnchor[]) {
    const seen = new Set<string>()
    const unique: SelectedWikiAnchor[] = []
    for (const item of results) {
      const key = `${item.sourceKind || 'wiki'}:${item.anchor_id}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(item)
    }
    return unique
  }

  function pruneWikiSearchCache(searchCache = wikiSearchCache) {
    const now = Date.now()
    for (const [key, value] of searchCache) {
      if (value.expiresAt < now) searchCache.delete(key)
    }
    while (searchCache.size > resolved.wiki.searchCacheMaxEntries) {
      const oldest = searchCache.keys().next().value
      if (!oldest) break
      searchCache.delete(oldest)
    }
  }

  function parseWikiShortcut(input: string) {
    const match = input.match(/^(.+?)\s+(\d+)$/)
    if (!match) return undefined
    const keyword = match[1].trim()
    const index = Number(match[2])
    if (!keyword || !Number.isInteger(index) || index <= 0) return undefined
    return { keyword, index }
  }

  async function showWikiContext(session: any, target: string, source?: WikiSearchSource) {
    if (!session) return '只能在会话中使用该命令。'
    const anchor = resolveWikiAnchor(session, target, source)
    if (!anchor) return '请先使用 w 关键词 检索，再用 w 编号 查看详情。'
    const actualSource = source || anchor.sourceKind || 'wiki'
    try {
      if (actualSource === 'wiki' && resolved.wiki.mode === 'official') return formatWikiContext({ anchor, full_text: [], summary: null, source_ref: anchor.source })
      const result = actualSource === 'story' ? await getStoryContext(anchor.anchor_id) : await wikiClient.context({
        anchorId: anchor.anchor_id,
        needSummary: false,
        contextRange: 3,
      })
      return formatWikiContext(result)
    } catch (error) {
      logger.warn(`${actualSource === 'story' ? '剧情/任务全文' : '终末地资料'}上下文检索失败：${formatError(error)}`)
      if (error instanceof WarfarinWikiApiError && error.code === 404) {
        return formatWikiContext({ anchor, full_text: [], summary: null, source_ref: anchor.source })
      }
      return formatWikiCommandError(error, '资料上下文暂时不可用，请稍后重试。')
    }
  }

  async function getStoryContext(anchorId: string) {
    if (resolved.wiki.storySearchEnabled) {
      try {
        return await storySearch.context({ anchorId })
      } catch {}
    }
    return storyClient.context({ anchorId, needSummary: false, contextRange: 3 })
  }

  async function pageWiki(session: any, direction: 1 | -1) {
    if (!session) return '只能在会话中使用该命令。'
    pruneWikiSelections()
    const key = getWikiSelectionKey(session)
    const cached = wikiSelections.get(key)
    if (!cached || cached.expiresAt < Date.now()) return '请先使用 w 关键词 检索。'
    const batchSize = getWikiBatchSize(resolved.wiki)
    const lastPageOffset = Math.floor(Math.max(0, cached.results.length - 1) / batchSize) * batchSize
    const nextOffset = Math.min(Math.max(0, cached.offset + direction * batchSize), lastPageOffset)
    cached.offset = nextOffset
    cached.expiresAt = Date.now() + resolved.wiki.selectionTtlMs
    return formatWikiSearchBatch({ results: cached.results, total: cached.total, took_ms: 0, keyword: cached.keyword, offset: cached.offset, pageSize: resolved.wiki.pageSize, pageCount: resolved.wiki.initialPageCount, commandName: 'w', sourceLabel: '综合搜索', showSourceLabel: false, dataUpdatedLabel: cached.dataUpdatedLabel })
  }

  async function pageWikiPage(session: any, page: unknown) {
    if (!session) return '只能在会话中使用该命令。'
    const pageNumber = Number(page)
    if (!Number.isInteger(pageNumber) || pageNumber <= 0) return '页码必须是大于 0 的整数。'
    pruneWikiSelections()
    const cached = wikiSelections.get(getWikiSelectionKey(session))
    if (!cached || cached.expiresAt < Date.now()) return '请先使用 w 关键词 检索。'
    const lastPage = Math.max(1, Math.ceil(cached.results.length / resolved.wiki.pageSize))
    cached.offset = (Math.min(pageNumber, lastPage) - 1) * resolved.wiki.pageSize
    cached.expiresAt = Date.now() + resolved.wiki.selectionTtlMs
    return formatWikiSearchResults({ results: cached.results, total: cached.total, took_ms: 0, keyword: cached.keyword, offset: cached.offset, pageSize: resolved.wiki.pageSize, commandName: 'w', sourceLabel: '综合搜索', showSourceLabel: false, dataUpdatedLabel: cached.dataUpdatedLabel })
  }

  async function sendWikiReply(session: any, createText: () => Promise<WikiReplyPayload> | WikiReplyPayload) {
    const text = await createText()
    return sendWikiText(session, text)
  }

  async function sendWikiText(session: any, text: WikiReplyPayload) {
    const messages = Array.isArray(text) ? text.filter(Boolean) : [text].filter(Boolean)
    if (!messages.length) return Array.isArray(text) ? undefined : text
    if (!shouldSendWikiForward(session)) {
      if (messages.length === 1) return messages[0]
      for (const message of messages) await session.send(message)
      return undefined
    }
    try {
      const sent = await sendOneBotForwardWithRetry(session, messages, resolved.wiki)
      if (sent) return undefined
    } catch (error) {
      logger.warn(`Warfarin Wiki 合并转发发送失败，回退普通文本：${sanitizeForwardError(error)}`)
    }
    const [fallback] = buildForwardFallbackMessages(messages)
    return fallback
  }

  function shouldSendWikiForward(session: any) {
    if (!resolved.wiki.groupForwardEnabled || !session) return false
    if (session.guildId || session.subtype === 'group') return true
    if (session.platform === 'onebot' && (session.userId || session.uid || session.channelId)) return true
    return false
  }

  function resolveWikiAnchor(session: any, target: string, source?: WikiSearchSource) {
    pruneWikiSelections()
    const normalized = String(target || '').trim()
    const index = Number(normalized)
    if (Number.isInteger(index) && index > 0) {
      const cached = wikiSelections.get(getWikiSelectionKey(session))
      if (!cached || cached.expiresAt < Date.now()) return undefined
      return cached.results[index - 1]
    }
    return { anchor_id: normalized, content: '', source: normalized, scope: 'wiki', relevance: 0, sourceKind: source || 'wiki' }
  }

  function pruneWikiSelections() {
    const now = Date.now()
    for (const [key, value] of wikiSelections) {
      if (value.expiresAt < now) wikiSelections.delete(key)
    }
  }

  async function runStoryUpdate(reason: string) {
    if (storyUpdating) return false
    storyUpdating = true
    try {
      const report = await storySearch.update()
      storySearchCache.clear()
      if (report.warning) logger.warn(`Warfarin GitHub 全文合集${reason}异常，继续使用本地缓存：${report.warning}`)
      logger.info(`Warfarin 全文文本${reason}完成：成功 ${report.success}，跳过 ${report.skipped}，重查 ${report.refreshed}，待补 ${report.pending}，失败 ${report.failed}。`)
      return true
    } catch (error) {
      logger.warn(`Warfarin 剧情文本${reason}失败：${formatError(error)}`)
      return false
    } finally {
      storyUpdating = false
    }
  }

  async function runManualStoryUpdate() {
    if (!resolved.wiki.storySearchEnabled) return { ok: false, message: 'Warfarin 本地全文搜索未启用。' }
    if (storyUpdating) return { ok: false, message: 'Warfarin 全文包正在更新，请稍后。' }
    const ok = await runStoryUpdate('手动拉取')
    return ok
      ? { ok: true, message: `已从远端拉取 Warfarin 全文包，本地 ${storySearch.size} 条。` }
      : { ok: false, message: 'Warfarin 全文包拉取失败，请查看日志。' }
  }

  async function buildConsoleStatus() {
    const ping = async (url: string) => {
      try {
        await ctx.http(url, { method: 'GET', timeout: resolved.wiki.timeoutMs, validateStatus: () => true })
        return '可用'
      } catch {
        return '不可用'
      }
    }
    return {
      daily: {
        enabled: resolved.dailyCardEnabled,
        refreshCron: resolved.refreshCron,
      },
      push: {
        enabled: resolved.scheduledPush.enabled,
        channels: resolved.scheduledPush.channels.filter(Boolean).length,
        cron: resolved.scheduledPush.cron,
      },
      sites: {
        prts: await ping('https://prts.wiki/'),
        warfarin: await ping(`${resolved.wiki.baseUrl.replace(/\/+$/g, '')}/${resolved.wiki.language}/search?q=%E6%81%AF%E5%A3%A4`),
        story: resolved.wiki.storySearchEnabled ? `本地 ${storySearch.size} 条` : await ping(`${resolved.wiki.storyBaseUrl.replace(/\/+$/g, '')}/${resolved.wiki.storyLanguage}/search?q=%E7%94%BB%E5%8D%B7%E9%80%9A%E9%81%93&scope=${storyScopes.join(',')}`),
      },
      cache: {
        searchTtlMs: resolved.wiki.searchCacheTtlMs,
        searchEntries: wikiSearchCache.size + storySearchCache.size,
        searchMaxEntries: resolved.wiki.searchCacheMaxEntries,
        searchLabel: formatSearchCacheStatus(resolved.wiki.searchCacheTtlMs, wikiSearchCache.size + storySearchCache.size, resolved.wiki.searchCacheMaxEntries),
      },
    }
  }

  async function runScheduledPushIfDue() {
    const schedule = resolved.scheduledPush
    if (!schedule.enabled) {
      logger.debug('日报定时推送跳过：未启用。')
      return
    }

    const channels = schedule.channels.map((item) => item.trim()).filter(Boolean)
    if (!channels.length) {
      logger.debug('日报定时推送跳过：频道白名单为空。')
      return
    }
    const now = nowProvider()
    const parts = getZonedParts(now, TIMEZONE)
    if (!matchesCronExpression(schedule.cron, parts)) {
      logger.debug(`日报定时推送未到触发时间：${schedule.cron}`)
      return
    }

    const dayKey = getPrtsDayKey(now, TIMEZONE, DAY_REFRESH_HOUR)
    if (dayKey === lastPushedDayKey) {
      logger.debug(`日报定时推送跳过：${dayKey} 已推送。`)
      return
    }
    const channelCount = channels.length

    try {
      logger.info(`日报定时推送开始：${dayKey}，频道 ${channelCount} 个。`)
      const daily = await service.getDailyInfo(false)
      await ctx.broadcast(channels, service.toBroadcastMessage(daily), true)
      lastPushedDayKey = dayKey
      logger.info(`日报定时推送完成：${dayKey}，频道 ${channelCount} 个。`)
    } catch (error) {
      logger.warn(`日报定时推送失败：${formatError(error)}`)
    }
  }
}

function resolveConfig(config: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    dailyCardEnabled: config.dailyCardEnabled ?? true,
    refreshCron: config.refreshCron || '5 4 * * *',
    logLevel: config.logLevel || 'info',
    scheduledPush: {
      enabled: config.scheduledPush?.enabled ?? false,
      channels: config.scheduledPush?.channels ?? [],
      cron: config.scheduledPush?.cron || `${config.scheduledPush?.minute ?? 10} ${config.scheduledPush?.hour ?? 8} * * *`,
      hour: config.scheduledPush?.hour,
      minute: config.scheduledPush?.minute,
    },
    wiki: {
      mode: config.wiki?.mode || 'official',
      baseUrl: config.wiki?.baseUrl || 'https://api.warfarin.wiki/v1',
      language: config.wiki?.language || 'cn',
      storyBaseUrl: config.wiki?.storyBaseUrl || 'https://api.warfarin.wiki/v1',
      storyLanguage: config.wiki?.storyLanguage || 'cn',
      storySearchEnabled: config.wiki?.storySearchEnabled ?? true,
      storyDataDirectory: config.wiki?.storyDataDirectory || 'data/miyako-intel/warfarin-story',
      storyUpdateCron: config.wiki?.storyUpdateCron || '20 4 * * *',
      storyUpdateOnStart: config.wiki?.storyUpdateOnStart ?? false,
      storyBundleManifestUrl: config.wiki?.storyBundleManifestUrl ?? defaultStoryBundleManifestUrl,
      timeoutMs: config.wiki?.timeoutMs ?? 10000,
      userAgent: config.wiki?.userAgent || defaultUserAgent,
      searchCacheTtlMs: config.wiki?.searchCacheTtlMs ?? 600000,
      searchCacheMaxEntries: config.wiki?.searchCacheMaxEntries ?? 100,
      pageSize: config.wiki?.pageSize ?? 5,
      initialPageCount: config.wiki?.initialPageCount ?? 5,
      selectionTtlMs: config.wiki?.selectionTtlMs ?? 300000,
      groupForwardEnabled: config.wiki?.groupForwardEnabled ?? false,
      groupForwardNodeLineLimit: config.wiki?.groupForwardNodeLineLimit ?? 20,
      groupForwardSenderName: config.wiki?.groupForwardSenderName || 'Warfarin Wiki',
      groupForwardSenderUin: config.wiki?.groupForwardSenderUin || '2854196310',
    },
    now: config.now || undefined,
  }
}

function formatError(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as Error & { cause?: any }).cause
  if (!cause) return error.message
  const detail = [cause.code, cause.name, cause.message].filter(Boolean).join(' ')
  return detail ? `${error.message} (${detail})` : error.message
}

function getWikiSelectionKey(session: any) {
  return [session?.platform || '', session?.guildId || '', session?.channelId || session?.cid || '', session?.userId || session?.uid || ''].join(':')
}

function formatWikiCommandError(error: unknown, fallback: string) {
  if (error instanceof WarfarinWikiApiError) {
    if (error.code === 400) return `检索参数不合法：${error.message}`
    if (error.code === 404) return `没有找到这条资料：${error.message}`
  }
  return fallback
}

function getWikiBatchSize(wikiConfig: RuntimeConfig['wiki']) {
  return Math.max(1, wikiConfig.pageSize) * Math.max(1, wikiConfig.initialPageCount)
}

function formatWikiSearchBatch(result: { results: SelectedWikiAnchor[]; total: number; took_ms: number; keyword: string; offset: number; pageSize: number; pageCount: number; commandName: string; sourceLabel: string; showSourceLabel: boolean; dataUpdatedLabel?: string }) {
  const pageSize = Math.max(1, result.pageSize)
  const pageCount = Math.max(1, result.pageCount)
  const maxOffset = Math.min(result.offset + pageSize * pageCount, result.results.length)
  const messages: string[] = []
  for (let offset = result.offset; offset < maxOffset; offset += pageSize) {
    const text = formatWikiSearchResults({
      results: result.results,
      total: result.total,
      took_ms: result.took_ms,
      keyword: result.keyword,
      offset,
      pageSize: result.pageSize,
      commandName: result.commandName,
      sourceLabel: result.sourceLabel,
      showSourceLabel: result.showSourceLabel,
      dataUpdatedLabel: result.dataUpdatedLabel,
    })
    if (text) messages.push(text)
  }
  if (messages.length) return messages
  return formatWikiSearchResults(result)
}

function formatSearchCacheStatus(ttlMs: number, entries: number, maxEntries: number) {
  if (!ttlMs) return '关闭'
  const minutes = Math.max(1, Math.round(ttlMs / 60000))
  return `${entries}/${maxEntries}，${minutes} 分钟`
}

async function sendOneBotForward(session: any, texts: string[], wikiConfig: RuntimeConfig['wiki']) {
  const onebot = session?.onebot || session?.bot?.internal
  const messages = buildOneBotForwardNodes(texts, wikiConfig)
  const groupId = session?.guildId || (session?.subtype === 'group' ? session?.channelId || session?.cid : '') || (isOneBotGroupChannel(session?.cid) ? session.cid : '')
  if (groupId) {
    if (onebot?.sendGroupForwardMsg) {
      await onebot.sendGroupForwardMsg(groupId, messages)
      return true
    }
    if (onebot?.send_group_forward_msg) {
      await onebot.send_group_forward_msg({ group_id: normalizeOneBotId(groupId), messages })
      return true
    }
  }
  const userId = session?.userId || session?.uid || (isOneBotPrivateChannel(session?.cid) ? session.cid : session?.channelId)
  if (!userId) return false
  if (onebot?.sendPrivateForwardMsg) {
    await onebot.sendPrivateForwardMsg(userId, messages)
    return true
  }
  if (onebot?.send_private_forward_msg) {
    await onebot.send_private_forward_msg({ user_id: normalizeOneBotId(userId), messages })
    return true
  }
  return false
}

const forwardRetryDelayMs = 2000

async function sendOneBotForwardWithRetry(session: any, texts: string[], wikiConfig: RuntimeConfig['wiki']) {
  try {
    return await sendOneBotForward(session, texts, wikiConfig)
  } catch (error) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, forwardRetryDelayMs))
    return sendOneBotForward(session, texts, wikiConfig)
  }
}

export function buildForwardFallbackMessages(messages: string[]) {
  if (messages.length <= 1) return messages
  return [
    `${messages[0]}\n（合并转发发送失败，已仅发送第 1/${messages.length} 段；可稍后重试获取完整内容。）`,
  ]
}

// 官方搜索与本地剧情包描述的是同一个 wiki；同一类型（scope）下标题相同的条目是同一个页面，
// 合并时保留正文更丰富的一条，避免两个来源各显示一遍。
export function foldCrossSourceDuplicates(results: SelectedWikiAnchor[]): SelectedWikiAnchor[] {
  const groups = new Map<string, SelectedWikiAnchor>()
  for (const item of results) {
    const key = `${item.scope || ''}\t${wikiSourceTitleKey(item.source)}`
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, item)
      continue
    }
    if (normalizeWikiFoldText(item.content).length > normalizeWikiFoldText(existing.content).length) {
      groups.set(key, item)
    }
  }
  return Array.from(groups.values())
}

function wikiSourceTitleKey(source: string) {
  const withoutHint = source.replace(/（另有 \d+ 个变体）/g, '')
  const index = withoutHint.indexOf('：')
  const label = index >= 0 ? withoutHint.slice(0, index) : ''
  const title = (index >= 0 ? withoutHint.slice(index + 1) : withoutHint).replace(/\s+/g, '')
  // 官方与本地对同一页面的类目标签不同（材料 vs 物品信息），归为同一类参与折叠；
  // "生产蓝图"是插件自设的独立类目，必须与物品本体区分开。
  const foldClass = label === '生产蓝图' ? '生产蓝图' : '*'
  return `${foldClass}|${title}`
}

function normalizeWikiFoldText(text: string) {
  return String(text || '').replace(/\s+/g, '')
}

function sanitizeForwardError(error: unknown) {
  // OneBot 适配器的错误消息会把完整 args（含全部节点正文）拼进 message，日志里只保留动作名。
  return formatError(error).replace(/, args: [\s\S]*$/, '')
}

function buildOneBotForwardNodes(texts: string[], wikiConfig: RuntimeConfig['wiki']) {
  const limit = Math.max(3, Math.min(80, Number(wikiConfig.groupForwardNodeLineLimit || 20)))
  const chunks: string[] = []
  for (const text of texts) {
    const lines = String(text || '').split(/\r?\n/)
    for (let index = 0; index < lines.length; index += limit) {
      chunks.push(lines.slice(index, index + limit).join('\n').trim())
    }
  }
  return chunks.filter(Boolean).map((content) => ({
    type: 'node',
    data: {
      name: wikiConfig.groupForwardSenderName || 'Warfarin Wiki',
      uin: normalizeOneBotId(wikiConfig.groupForwardSenderUin || '2854196310'),
      content,
    },
  }))
}

function normalizeOneBotId(value: unknown) {
  const text = String(value || '').trim()
  const match = text.match(/^onebot:(?:group|private):(\d+)$/i)
  if (match) return Number(match[1])
  return /^\d+$/.test(text) ? Number(text) : text
}

function isOneBotGroupChannel(value: unknown) {
  return /^onebot:group:\d+$/i.test(String(value || '').trim())
}

function isOneBotPrivateChannel(value: unknown) {
  return /^onebot:private:\d+$/i.test(String(value || '').trim())
}

function createKoishiHttpFetch(http: any, timeoutMs: number) {
  if (!http) return undefined
  return async (url: string, init: Record<string, any> = {}) => {
    const options: Record<string, any> = {
      method: init.method,
      headers: init.headers,
      responseType: init.responseType,
      timeout: timeoutMs,
      signal: init.signal,
      validateStatus: () => true,
    }
    if (init.body !== undefined) options.data = JSON.parse(init.body)
    const response = await http(url, options)
    if (response && typeof response === 'object' && 'data' in response && 'status' in response) return response.data
    return response
  }
}

function createScopedLogger(base: any, level: RuntimeConfig['logLevel']) {
  const rank = { silent: 0, warn: 1, info: 2, debug: 3 } as const
  const current = rank[level] ?? rank.info
  return {
    warn(message: string) {
      if (current >= rank.warn) base.warn(message)
    },
    info(message: string) {
      if (current >= rank.info) base.info(message)
    },
    debug(message: string) {
      if (current >= rank.debug) (base.debug || base.info).call(base, message)
    },
  }
}
