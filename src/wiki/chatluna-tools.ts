// ChatLuna 工具接入：把 wiki 客户端包成模型能自己调的两个函数 schema
import { WarfarinWikiClient } from '../services/warfarin-wiki'

export interface ChatLunaToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  execute: (input: Record<string, any>) => Promise<any>
}

export function createWarfarinWikiTools(client: Pick<WarfarinWikiClient, 'search' | 'context'>): ChatLunaToolDefinition[] {
  return [
    {
      name: 'warfarin_wiki_search',
      description: 'Search Warfarin Wiki official index by keyword.',
      parameters: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] },
      execute: (input) => client.search({ keyword: String(input.keyword || '') }),
    },
    {
      name: 'warfarin_wiki_context',
      description: 'Fetch best-effort source context for a Warfarin Wiki slug or anchor id.',
      parameters: {
        type: 'object',
        properties: {
          anchor_id: { type: 'string' },
          need_summary: { type: 'boolean' },
          context_range: { type: 'number', minimum: 0, maximum: 10 },
        },
        required: ['anchor_id'],
      },
      execute: (input) => client.context({
        anchorId: String(input.anchor_id || ''),
        needSummary: input.need_summary === true,
        contextRange: input.context_range === undefined ? undefined : Number(input.context_range),
      }),
    },
  ]
}
