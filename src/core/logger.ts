import { LogLevel } from '../types'

export interface ScopedLogger {
  warn: (message: string) => void
  info: (message: string) => void
  debug: (message: string) => void
}

const RANK = { silent: 0, warn: 1, info: 2, debug: 3 } as const

/** 按配置的日志等级过滤输出；debug 在没有 debug 通道时退化为 info */
export function createScopedLogger(base: any, level: LogLevel): ScopedLogger {
  const current = RANK[level] ?? RANK.info
  return {
    warn(message: string) {
      if (current >= RANK.warn) base.warn(message)
    },
    info(message: string) {
      if (current >= RANK.info) base.info(message)
    },
    debug(message: string) {
      if (current >= RANK.debug) (base.debug || base.info).call(base, message)
    },
  }
}
