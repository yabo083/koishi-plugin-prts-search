// 后台定时任务：每分钟跑一轮，各任务用「cron 命中 + 当天未跑过」双条件把门
import { Context } from 'koishi'
import { ScopedLogger } from './logger'
import { DAY_REFRESH_HOUR, TIMEZONE } from './constants'
import { matchesCronExpression } from './cron'
import { getPrtsDayKey, getZonedParts } from './time'

/**
 * 按「日切键」记住每个任务当天跑过没有：同一个 cron 在一分钟内可能被轮询到多次，
 * 且插件重载后也不该重复推送，所以判定统一收在这里。
 */
export class DailyCronGate {
  private readonly lastRun = new Map<string, string>()

  constructor(private readonly nowProvider: () => Date) {}

  /** 到点且今天还没跑过 → 返回当天的 dayKey；否则返回空并把跳过原因写进 debug */
  due(slot: string, cron: string, label: string, logger?: ScopedLogger): string | undefined {
    const now = this.nowProvider()
    if (!matchesCronExpression(cron, getZonedParts(now, TIMEZONE))) {
      logger?.debug(`${label}未到触发时间：${cron}`)
      return undefined
    }
    const dayKey = getPrtsDayKey(now, TIMEZONE, DAY_REFRESH_HOUR)
    if (this.lastRun.get(slot) === dayKey) {
      logger?.debug(`${label}跳过：${dayKey} 已执行。`)
      return undefined
    }
    return dayKey
  }

  markDone(slot: string, dayKey: string) {
    this.lastRun.set(slot, dayKey)
  }
}

/** 每分钟一轮；上一轮没跑完就跳过这一轮，避免抓取任务叠在一起 */
export function startBackgroundLoop(ctx: Context, run: () => Promise<void>) {
  let running = false
  ctx.setInterval(async () => {
    if (running) return
    running = true
    try {
      await run()
    } finally {
      running = false
    }
  }, 60 * 1000)
}
