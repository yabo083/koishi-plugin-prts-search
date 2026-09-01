// 检索编排：官方 API 与本地剧情包并行搜、结果折叠、按关键词缓存
import { ScopedLogger } from '../core/logger'
import { formatError } from '../core/errors'
import { Config as RuntimeConfig } from '../types'
import { WarfarinWikiClient } from '../services/warfarin-wiki'
import { WarfarinStorySearchService } from '../services/warfarin-story-search'
import {
  SelectedWikiAnchor, WikiSearchResult, WikiSearchSource,
  dedupeWikiResults, emptyWikiSearchResult, foldCrossSourceDuplicates, tagWikiSearchResult,
} from './fold'

interface CacheEntry {
  expiresAt: number
  result: WikiSearchResult
}

export interface WikiSearchDeps {
  wikiClient: WarfarinWikiClient
  storyClient: WarfarinWikiClient
  storySearch: WarfarinStorySearchService
  wiki: RuntimeConfig['wiki']
  storyScopes: string[]
  logger: ScopedLogger
}

export class WikiSearchOrchestrator {
  private readonly caches: Record<WikiSearchSource, Map<string, CacheEntry>> = {
    wiki: new Map(),
    story: new Map(),
  }

  constructor(private readonly deps: WikiSearchDeps) {}

  get cachedEntryCount() {
    return this.caches.wiki.size + this.caches.story.size
  }

  clearStoryCache() {
    this.caches.story.clear()
  }

  /** 两个来源都失败才算失败；只挂一个就用另一个的结果，并记一条 warn */
  async searchAllSources(keyword: string): Promise<WikiSearchResult<SelectedWikiAnchor>> {
    const settled = await Promise.allSettled([
      this.searchSource(keyword, 'wiki'),
      this.searchSource(keyword, 'story'),
    ])
    if (settled[0].status === 'rejected' && settled[1].status === 'rejected') throw settled[0].reason
    if (settled[0].status === 'rejected') {
      this.deps.logger.warn(`Warfarin Wiki 官方搜索失败，使用剧情全文结果：${formatError(settled[0].reason)}`)
    }
    if (settled[1].status === 'rejected') {
      this.deps.logger.warn(`剧情/任务全文搜索失败，使用官方结果：${formatError(settled[1].reason)}`)
    }
    const wiki = settled[0].status === 'fulfilled' ? tagWikiSearchResult(settled[0].value, 'wiki') : emptyWikiSearchResult()
    const story = settled[1].status === 'fulfilled' ? tagWikiSearchResult(settled[1].value, 'story') : emptyWikiSearchResult()
    const results = foldCrossSourceDuplicates(dedupeWikiResults([...wiki.results, ...story.results]))
    return { results, total: results.length, took_ms: Math.max(wiki.took_ms, story.took_ms) }
  }

  async searchSingleSource(keyword: string, source: WikiSearchSource) {
    return tagWikiSearchResult(await this.searchSource(keyword, source), source)
  }
  /** 单来源检索 + TTL 缓存；缓存键带上源站地址，换源不会命中旧结果 */
  private async searchSource(keyword: string, source: WikiSearchSource): Promise<WikiSearchResult> {
    const { wiki } = this.deps
    const key = source === 'story'
      ? `story:${wiki.storyBaseUrl}:${this.deps.storyScopes.join(',')}:${keyword}`
      : `${wiki.mode}:${wiki.baseUrl}:${keyword}`
    const cache = this.caches[source]
    const now = Date.now()
    if (wiki.searchCacheTtlMs > 0) {
      const cached = cache.get(key)
      if (cached && cached.expiresAt > now) return cached.result
      if (cached) cache.delete(key)
    }
    const result = await (source === 'story' ? this.searchStory(keyword) : this.deps.wikiClient.search({ keyword }))
    if (wiki.searchCacheTtlMs > 0) {
      cache.set(key, { expiresAt: now + wiki.searchCacheTtlMs, result })
      this.pruneCache(cache)
    }
    return result
  }

  /** 本地全文包优先，命中不到再问远端 */
  private async searchStory(keyword: string) {
    if (this.deps.wiki.storySearchEnabled) {
      const local = await this.deps.storySearch.search({ keyword })
      if (local.results.length) return local
    }
    return this.deps.storyClient.search({ keyword })
  }

  async fetchContext(anchorId: string, source: WikiSearchSource) {
    if (source === 'story') return this.fetchStoryContext(anchorId)
    return this.deps.wikiClient.context({ anchorId, needSummary: false, contextRange: 3 })
  }

  private async fetchStoryContext(anchorId: string) {
    if (this.deps.wiki.storySearchEnabled) {
      try {
        return await this.deps.storySearch.context({ anchorId })
      } catch {}
    }
    return this.deps.storyClient.context({ anchorId, needSummary: false, contextRange: 3 })
  }

  async storyDataUpdatedLabel() {
    if (!this.deps.wiki.storySearchEnabled) return ''
    return this.deps.storySearch.getDataUpdatedLabel().catch(() => '')
  }

  private pruneCache(cache: Map<string, CacheEntry>) {
    const now = Date.now()
    for (const [key, value] of cache) {
      if (value.expiresAt < now) cache.delete(key)
    }
    while (cache.size > this.deps.wiki.searchCacheMaxEntries) {
      const oldest = cache.keys().next().value
      if (!oldest) break
      cache.delete(oldest)
    }
  }
}
