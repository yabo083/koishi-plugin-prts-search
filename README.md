# koishi-plugin-miyako-intel

Miyako 游戏情报插件。提供 PRTS 每日「今日信笺」情报卡片（自动抓取渲染 + 定时推送），以及 Warfarin Wiki 资料与剧情全文检索。

## 功能

- **每日情报信笺**：每天按 `refreshCron` 自动抓取 PRTS 首页，渲染手账风「今日信笺」卡片——今日资源收集、核心动态倒计时、生日干员半身立绘贴画、近期新增干员与关卡，并通过 `scheduledPush` 定时推送到指定群。卡片全自动运行，无聊天命令。
- `w <关键词>`：检索 Warfarin Wiki 官方资料和本地全文缓存；默认一次返回 5 条消息，每条 5 项。
- `w <编号>`：查看上一轮检索结果详情，例如 `w 1`。
- `w+` / `w-` / `w+2`：翻页或跳转到指定页。
- `w <关键词> <编号>`：搜索后直接查看指定结果，例如 `w 息壤 2`。

## 运行要求

- 「今日信笺」渲染需要 Koishi `puppeteer` 服务；字体（霞鹜文楷 Lite / 志莽行书）随 npm 依赖自动安装，无需系统字体。
- `w` 官方资料检索需要能访问 Warfarin Wiki API。
- Warfarin 全文检索使用本地缓存和远程压缩包更新；运行中的插件不会自行全量爬取 Warfarin 源站文本接口。

## 配置示例

```yaml
plugins:
  miyako-intel:
    dailyCardEnabled: true
    logLevel: info
    refreshCron: 5 4 * * *
    scheduledPush:
      enabled: false
      channels:
        - onebot:123456789
      cron: 10 8 * * *

    # Warfarin Wiki
    wiki:
      language: cn
      storySearchEnabled: true
      storyUpdateCron: 20 4 * * *
      storyUpdateOnStart: false
      pageSize: 5
      initialPageCount: 5
```

cron 使用 5 段格式：`分钟 小时 日期 月份 星期`，按东八区生效。`wiki.pageSize` 控制每条搜索结果消息包含多少项，`wiki.initialPageCount` 控制首次 `w <关键词>` 和 `w+` / `w-` 相对翻页一次发送多少页。默认会先发送 `1-25`，`w+` 继续发送 `26-50`，`w-` 返回上一批窗口。

## 缓存与更新

「今日信笺」卡片按 04:00（东八区）日切写入本地缓存（`data/miyako-intel/cache`），刷新失败自动回退上一份可用缓存；过期缓存按月归档并清理。生日干员半身立绘来自 PRTS Wiki，按 30 天磁盘缓存，抓取失败时自动退化为头像图。

Warfarin 全文数据随包带一份中文种子；后续更新只读取远程 manifest 和压缩包。下载后会校验 `sha256`，通过后再替换本地全文缓存。

## 设计

「今日信笺」版式原型见 `design/letter-prototype/`（可在任意静态服务器打开预览）。

## 开发

```bash
npm install
npm run build
npm test
```

服务端 TypeScript 会编译到 `lib/`，Koishi 控制台客户端会构建到 `dist/`。`scripts/e2e-letter-card.js` 可脱离 Koishi 直接驱动真实 PRTS 出一张卡片图做视觉验证。

## 许可证

本插件使用 `AGPL-3.0-only`。发布修改版或作为网络服务提供时，请按 AGPL 要求公开对应源码，并保留版权声明。
