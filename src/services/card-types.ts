// 卡片渲染的数据形状。渲染器（card-template / card-weekly / card-newspaper）与
// 抓取侧都依赖它，单独成文件才不会让「注册表 → 渲染器 → 注册表」绕成循环依赖。

export interface SealSlot {
  ch: string
  x: number
  y: number
}

export interface DailyCoreItem {
  name: string
  action: '刷新' | '结束'
  remainingText: string
  urgency: 'safe' | 'warn' | 'danger'
}

export interface DailyOperator {
  name: string
  rarity: number
  /** 首页头像直链；「泰拉周刊」用它做名字前的圆形图砖，抓取失败时留空由渲染器兜底 */
  avatar?: string
}

export interface DailyBirthdayOperator {
  name: string
  /** 首页头像直链，立绘抓取失败时的兜底 */
  avatar: string
  /** base64 数据 URL；抓取失败时为空串 */
  art: string
  tilt: number
  tape: string
}

export interface DailyStageGroup {
  /** 关卡集名，如「踏上归家长途」 */
  title: string
  /** 压缩后的号段，如「TO-EX-1 ~ TO-EX-8」 */
  codes: string
}

export interface DailyCardData {
  dateText: string
  weekText: string
  sealSlots: SealSlot[]
  capturedAtText: string
  collectIntro: string
  collectMaterial: string[]
  collectChips: string[]
  core: DailyCoreItem[]
  birthdays: DailyBirthdayOperator[]
  recentOperators: DailyOperator[]
  poolOperators: DailyOperator[]
  /** 单行版关卡信息（今日信笺 / 泰拉晨报用） */
  stageLine: string
  /** 活动名，如「SideStory 「直到大地变成一颗酸橙」」 */
  stageTitle: string
  /** 各关卡集（泰拉周刊按这个分行排） */
  stageGroups: DailyStageGroup[]
}
