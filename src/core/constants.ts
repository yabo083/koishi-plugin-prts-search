/** 插件全局的时间口径：所有 cron 与日切都按东八区、04:00 日切 */
export const TIMEZONE = 'Asia/Shanghai'
export const DAY_REFRESH_HOUR = 4

/** 缓存根目录（相对 ctx.baseDir），不再作为用户配置暴露 */
export const DAILY_CACHE_DIRECTORY = 'data/miyako-intel/cache'

/** 外部请求的默认 UA：主体伪装成桌面 Chrome，尾部留插件标识便于对端溯源 */
export const defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 miyako-intel'
