// 会话级的检索结果选择态：w 编号 / w+ / w- 都靠它记住上一轮结果与当前页
import { SelectedWikiAnchor, WikiSearchSource } from './fold'

export interface WikiSelection {
  expiresAt: number
  keyword: string
  offset: number
  total: number
  results: SelectedWikiAnchor[]
  dataUpdatedLabel?: string
}

/** 同一个人在同一个频道里才算同一条会话线 */
export function getWikiSelectionKey(session: any) {
  return [
    session?.platform || '',
    session?.guildId || '',
    session?.channelId || session?.cid || '',
    session?.userId || session?.uid || '',
  ].join(':')
}

export class WikiSelectionStore {
  private readonly entries = new Map<string, WikiSelection>()

  constructor(private readonly ttlMs: number) {}

  private prune() {
    const now = Date.now()
    for (const [key, value] of this.entries) {
      if (value.expiresAt < now) this.entries.delete(key)
    }
  }

  remember(session: any, value: Omit<WikiSelection, 'expiresAt'>) {
    this.prune()
    this.entries.set(getWikiSelectionKey(session), { ...value, expiresAt: Date.now() + this.ttlMs })
  }

  has(session: any) {
    return this.entries.has(getWikiSelectionKey(session))
  }

  get(session: any): WikiSelection | undefined {
    this.prune()
    const entry = this.entries.get(getWikiSelectionKey(session))
    if (!entry || entry.expiresAt < Date.now()) return undefined
    return entry
  }

  /** 相对翻页：一次挪一整批（pageSize × pageCount），不越过最后一批 */
  shiftBatch(session: any, direction: 1 | -1, batchSize: number) {
    const entry = this.get(session)
    if (!entry) return undefined
    const lastOffset = Math.floor(Math.max(0, entry.results.length - 1) / batchSize) * batchSize
    entry.offset = Math.min(Math.max(0, entry.offset + direction * batchSize), lastOffset)
    entry.expiresAt = Date.now() + this.ttlMs
    return entry
  }

  /** 跳到指定页（1 起算），超出末页则停在末页 */
  jumpToPage(session: any, page: number, pageSize: number) {
    const entry = this.get(session)
    if (!entry) return undefined
    const lastPage = Math.max(1, Math.ceil(entry.results.length / pageSize))
    entry.offset = (Math.min(page, lastPage) - 1) * pageSize
    entry.expiresAt = Date.now() + this.ttlMs
    return entry
  }

  /** 数字按上一轮结果的序号解析；其余当作直接给定的 anchor_id */
  resolveAnchor(session: any, target: string, source?: WikiSearchSource): SelectedWikiAnchor | undefined {
    const normalized = String(target || '').trim()
    const index = Number(normalized)
    if (Number.isInteger(index) && index > 0) {
      return this.get(session)?.results[index - 1]
    }
    return { anchor_id: normalized, content: '', source: normalized, scope: 'wiki', relevance: 0, sourceKind: source || 'wiki' }
  }
}
