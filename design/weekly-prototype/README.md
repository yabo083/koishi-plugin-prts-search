# 泰拉周刊 · 版式原型

插件里 `src/services/card-weekly.ts` 出的是本目录探索后定稿的那一版：**夜间模式 + V2 装订书脊外框**。
原型保留了完整的探索过程，改版式时先在这里调，再同步回 TS。

| 文件 | 用途 |
| --- | --- |
| `weekly.html` | 单页预览，参数：`case=multi\|solo\|none`、`week=0..6`（七日配色）、`frame=1..7`（外框）、`theme=dark`、`shade=ghost`（素材做水印的备选方案） |
| `weekly-gallery.html` | 一周七色 + 无生日 / 单人封面 / 衬影备选，共十格 |
| `weekly-frames.html` | 七版外框对比，左边缩到 400px（群聊真实观感），右边 1/2 尺寸细节 |
| `weekly-dark.html` | 夜间模式 × V2/V3/V7 外框，末格是白天版对照 |
| `weekly-birthday-quote.html` | 单人生日板块：贺语换成「干员报到」台词的定稿页。参数：`q=1..5`（台词长度档位，1=真实样本）、`week=0..6`。字号 40px 起自适应，放不下先扩板块（396→560px，立绘跟随拉伸）再降字号至 22px 下限；立绘与「姓名+台词」栏实测等高居中 |
| `shot.js` | `node shot.js weekly.html "case=multi&week=2&theme=dark"` 截 `#letter` |
| `sim-compress.js` | `node sim-compress.js qa-xxx.png 410` 模拟群聊二压（缩到 410px 存 JPEG q45），验字重 |

两个脚本里的 Chrome 路径和 `puppeteer-core` 路径是本机绝对路径，换机器要改。

原型页引用的 `assets/`（生日立绘样例、道具/芯片/头像素材）没有随仓库提交：
道具与芯片图标的正式副本在插件包的 `assets/icons/`，立绘和头像运行时从 PRTS 抓。

## 定尺依据

群聊会把整图压到约 400px 宽（≈1/3），所以一切按「缩到三分之一还要读得清」来定：
内页恒定 1080 宽、正文不小于 26px、栏目标题用反白亮块、分区靠磨砂玻璃卡的亮边分界。
