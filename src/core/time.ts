// 时间口径：日切键与 cron 判定共用的墙钟换算。
// 与缓存无关（缓存只是它的使用者之一），所以放在 core 而不是 services/cache。
import { DAY_REFRESH_HOUR, TIMEZONE } from './constants'

/** 日切键：04:00 前算前一天，用作缓存目录名与「今天推过没有」的判定键 */
export function getPrtsDayKey(date = new Date(), timezone = TIMEZONE, refreshHour = DAY_REFRESH_HOUR): string {
  const parts = getZonedParts(date, timezone)
  let year = parts.year
  let month = parts.month
  let day = parts.day

  if (parts.hour < refreshHour) {
    const previous = new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000)
    year = previous.getUTCFullYear()
    month = previous.getUTCMonth() + 1
    day = previous.getUTCDate()
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 取指定时区的墙钟字段；weekday 为 0=周日，与 cron 的星期口径一致 */
export function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const values = new Map<string, string>()
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values.set(part.type, part.value)
  }

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    weekday: new Date(Date.UTC(Number(values.get('year')), Number(values.get('month')) - 1, Number(values.get('day')))).getUTCDay(),
  }
}
