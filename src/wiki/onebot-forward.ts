// OneBot/NapCat 合并转发：把多段文本拆成节点、发群/发私聊、失败重试一次
import { Config as RuntimeConfig } from '../types'

type WikiConfig = RuntimeConfig['wiki']

const FORWARD_RETRY_DELAY_MS = 2000

/** onebot:group:123 / 纯数字 都归一成 OneBot 需要的数字 id */
export function normalizeOneBotId(value: unknown) {
  const text = String(value || '').trim()
  const match = text.match(/^onebot:(?:group|private):(\d+)$/i)
  if (match) return Number(match[1])
  return /^\d+$/.test(text) ? Number(text) : text
}

export function isOneBotGroupChannel(value: unknown) {
  return /^onebot:group:\d+$/i.test(String(value || '').trim())
}

export function isOneBotPrivateChannel(value: unknown) {
  return /^onebot:private:\d+$/i.test(String(value || '').trim())
}

/** 每个节点最多 groupForwardNodeLineLimit 行，超长文本按行切开 */
export function buildOneBotForwardNodes(texts: string[], wikiConfig: WikiConfig) {
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
/** 群优先、私聊兜底；两套命名（驼峰 / 下划线）都试，适配不同 OneBot 实现 */
async function sendOneBotForward(session: any, texts: string[], wikiConfig: WikiConfig) {
  const onebot = session?.onebot || session?.bot?.internal
  const messages = buildOneBotForwardNodes(texts, wikiConfig)
  const groupId = session?.guildId
    || (session?.subtype === 'group' ? session?.channelId || session?.cid : '')
    || (isOneBotGroupChannel(session?.cid) ? session.cid : '')
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
  const userId = session?.userId || session?.uid
    || (isOneBotPrivateChannel(session?.cid) ? session.cid : session?.channelId)
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

/** 转发接口偶发失败，隔 2s 重试一次再交给上层回退 */
export async function sendOneBotForwardWithRetry(session: any, texts: string[], wikiConfig: WikiConfig) {
  try {
    return await sendOneBotForward(session, texts, wikiConfig)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, FORWARD_RETRY_DELAY_MS))
    return sendOneBotForward(session, texts, wikiConfig)
  }
}

/** 转发彻底失败时只发第一段并说明，避免把十几条消息刷进群里 */
export function buildForwardFallbackMessages(messages: string[]) {
  if (messages.length <= 1) return messages
  return [
    `${messages[0]}\n（合并转发发送失败，已仅发送第 1/${messages.length} 段；可稍后重试获取完整内容。）`,
  ]
}
