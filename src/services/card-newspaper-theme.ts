// 报纸主题：取自 arkplatte 干员主题色库的 7 套配色，按周一~周日循环
// 每套含：纸底、主墨、强调红、点缀、次要、辅助。用 CSS 变量贯通全报。
export interface NewspaperTheme {
  id: string
  name: string
  paper: string
  ink: string
  accent: string
  star: string
  soft: string
  rule: string
}

function rgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const NEWSPAPER_THEMES: Record<number, NewspaperTheme> = {
  // 周一 · 冷冽晨雾
  1: { id: 'mon', name: '冷冽晨雾', paper: '#F1EBE9', ink: '#44414C', accent: '#B94752', star: '#7E8FB5', soft: '#B1ABB3', rule: '#1F1F27' },
  // 周二 · 湛蓝深海
  2: { id: 'tue', name: '湛蓝深海', paper: '#DDE7EE', ink: '#171A2A', accent: '#5FAFC8', star: '#7E8FB5', soft: '#5C6477', rule: '#171A2A' },
  // 周三 · 绯红硝烟
  3: { id: 'wed', name: '绯红硝烟', paper: '#F3ECEB', ink: '#2A2530', accent: '#8F3343', star: '#B8C7EB', soft: '#DFE2F4', rule: '#1F1F27' },
  // 周四 · 苔原军绿
  4: { id: 'thu', name: '苔原军绿', paper: '#EFE5DC', ink: '#2F3A2F', accent: '#6D6E9B', star: '#5CB19C', soft: '#C8CEBA', rule: '#29322E' },
  // 周五 · 鎏金余晖
  5: { id: 'fri', name: '鎏金余晖', paper: '#FBF3E6', ink: '#37312A', accent: '#C69A3A', star: '#B94752', soft: '#EBBEC7', rule: '#271D20' },
  // 周六 · 靛青暮色
  6: { id: 'sat', name: '靛青暮色', paper: '#EDEEF2', ink: '#1F1F27', accent: '#3993AC', star: '#BED7E2', soft: '#76A9BB', rule: '#001437' },
  // 周日 · 玫瑰浮世
  7: { id: 'sun', name: '玫瑰浮世', paper: '#FCEFEC', ink: '#3A2126', accent: '#D01819', star: '#AD8A73', soft: '#E99FA4', rule: '#3A3F47' },
}

export function getNewspaperTheme(dayIndex: number): NewspaperTheme {
  // dayIndex 0=周日,1=周一... 与 getZonedParts().weekday 一致
  const key = dayIndex === 0 ? 7 : dayIndex
  return NEWSPAPER_THEMES[key]
}

export function newspaperThemeVars(theme: NewspaperTheme): string {
  return `
  --np-paper: ${theme.paper};
  --np-ink: ${theme.ink};
  --np-ink-soft: ${rgba(theme.ink, 0.6)};
  --np-rule: ${rgba(theme.ink, 0.82)};
  --np-rule-thin: ${rgba(theme.ink, 0.34)};
  --np-red: ${theme.accent};
  --np-star: ${theme.star};
  --np-soft: ${theme.soft};
`
}
