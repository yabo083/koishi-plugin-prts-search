// 日报的后台任务：定时刷新（服务内部判定）、定时推送、缓存归档
import { Context } from 'koishi'
import { ScopedLogger } from '../core/logger'
import { formatError } from '../core/errors'
import { DailyCronGate } from '../core/scheduler'
import { Config as RuntimeConfig } from '../types'
import { DEFAULT_CACHE_MAINTENANCE, DailyImageCache } from '../services/cache'
import { PrtsCaptureService } from '../services/capture'
import { toDailyImageMessage } from './message'

export interface DailyJobsDeps {
  ctx: Context
  capture: PrtsCaptureService
  cache: DailyImageCache
  config: RuntimeConfig
  gate: DailyCronGate
  logger: ScopedLogger
}

export function createDailyJobs(deps: DailyJobsDeps) {
  const { ctx, capture, cache, config, gate, logger } = deps

  async function pushIfDue() {
    const schedule = config.scheduledPush
    if (!schedule.enabled) {
      logger.debug('日报定时推送跳过：未启用。')
      return
    }
    const channels = schedule.channels.map((item) => item.trim()).filter(Boolean)
    if (!channels.length) {
      logger.debug('日报定时推送跳过：频道白名单为空。')
      return
    }
    const dayKey = gate.due('push', schedule.cron, '日报定时推送', logger)
    if (!dayKey) return

    // ctx.broadcast 会把传入的频道数组消费成空，日志里的数量必须先存下来
    const channelCount = channels.length
    try {
      logger.info(`日报定时推送开始：${dayKey}，频道 ${channelCount} 个。`)
      const daily = await capture.getDailyInfo(false)
      await ctx.broadcast(channels, toDailyImageMessage(daily), true)
      gate.markDone('push', dayKey)
      logger.info(`日报定时推送完成：${dayKey}，频道 ${channelCount} 个。`)
    } catch (error) {
      logger.warn(`日报定时推送失败：${formatError(error)}`)
    }
  }

  async function maintainCacheIfDue() {
    const maintenance = DEFAULT_CACHE_MAINTENANCE
    const dayKey = gate.due('maintain', maintenance.archiveCron, '缓存维护', logger)
    if (!dayKey) return
    try {
      const report = await cache.maintain(maintenance)
      gate.markDone('maintain', dayKey)
      logger.info(`缓存维护完成：保留 ${report.keptDayKeys.length} 天，归档 ${report.archivedDayKeys.length} 天，删除 ${report.deletedDayKeys.length} 天。`)
    } catch (error) {
      logger.warn(`缓存维护失败：${formatError(error)}`)
    }
  }

  return {
    async runDue() {
      await capture.refreshDue()
      await pushIfDue()
      await maintainCacheIfDue()
    },
  }
}
