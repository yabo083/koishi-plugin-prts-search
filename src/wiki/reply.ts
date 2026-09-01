// 回复发送：群聊按配置走 OneBot 合并转发，失败回退普通文本
import { ScopedLogger } from '../core/logger'
import { sanitizeForwardError } from '../core/errors'
import { Config as RuntimeConfig } from '../types'
import { WikiReplyPayload } from './fold'
import { buildForwardFallbackMessages, sendOneBotForwardWithRetry } from './onebot-forward'

type WikiConfig = RuntimeConfig['wiki']

/** 群聊、或 OneBot 私聊（转发在私聊也能用）才走合并转发 */
function shouldSendForward(session: any, wikiConfig: WikiConfig) {
  if (!wikiConfig.groupForwardEnabled || !session) return false
  if (session.guildId || session.subtype === 'group') return true
  if (session.platform === 'onebot' && (session.userId || session.uid || session.channelId)) return true
  return false
}

export interface WikiReplySender {
  /** 返回值交给 Koishi 当命令回复；已自行 send 完的场景返回 undefined */
  send: (session: any, payload: WikiReplyPayload) => Promise<string | undefined>
  from: (session: any, create: () => Promise<WikiReplyPayload> | WikiReplyPayload) => Promise<string | undefined>
}

export function createWikiReplySender(wikiConfig: WikiConfig, logger: ScopedLogger): WikiReplySender {
  async function send(session: any, payload: WikiReplyPayload) {
    const messages = (Array.isArray(payload) ? payload : [payload]).filter(Boolean) as string[]
    if (!messages.length) return Array.isArray(payload) ? undefined : payload || undefined
    if (!shouldSendForward(session, wikiConfig)) {
      if (messages.length === 1) return messages[0]
      for (const message of messages) await session.send(message)
      return undefined
    }
    try {
      const sent = await sendOneBotForwardWithRetry(session, messages, wikiConfig)
      if (sent) return undefined
    } catch (error) {
      logger.warn(`Warfarin Wiki 合并转发发送失败，回退普通文本：${sanitizeForwardError(error)}`)
    }
    const [fallback] = buildForwardFallbackMessages(messages)
    return fallback
  }

  return {
    send,
    async from(session, create) {
      return send(session, await create())
    },
  }
}
