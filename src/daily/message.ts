// 缓存图片 → 聊天消息。抓取服务只负责产出图片字节，消息形态由这一层决定，
// 定时推送与 prts 手动命令共用同一份，避免两处各拼一遍 data URL。
import { h } from 'koishi'
import { CachedImageResult } from '../types'

export function toDailyImageMessage(result: CachedImageResult) {
  return h.image(`data:${result.mimeType || 'image/png'};base64,${result.buffer.toString('base64')}`)
}
