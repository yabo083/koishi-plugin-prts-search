/** 错误转日志文本：带上 cause 里的 code/name/message，网络类错误才看得出原因 */
export function formatError(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as Error & { cause?: any }).cause
  if (!cause) return error.message
  const detail = [cause.code, cause.name, cause.message].filter(Boolean).join(' ')
  return detail ? `${error.message} (${detail})` : error.message
}

/** OneBot 适配器会把完整 args（含全部转发节点正文）拼进 message，日志里只留动作名 */
export function sanitizeForwardError(error: unknown) {
  return formatError(error).replace(/, args: [\s\S]*$/, '')
}
