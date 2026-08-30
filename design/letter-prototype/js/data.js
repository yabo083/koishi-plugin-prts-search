// 今日信笺数据（现阶段手工收集自 PRTS 首页；后续会梳理成带重试/兜底/缓存的输入器）

// 生日干员贴画：tilt 为贴纸倾角，tape 为和纸胶带颜色；布局（重叠/换行/居中）由 render.js 计算
window.BIRTHDAY_STICKERS = [
  { name: "火龙S黑角", img: "./assets/huolongs_heijiao_2.png", tilt: -5, tape: "rgba(79, 133, 120, 0.35)" },
  { name: "特克诺",    img: "./assets/tekenuo_1.png",         tilt: 3,  tape: "rgba(195, 74, 58, 0.32)" },
  { name: "陨星",      img: "./assets/yunxing_2.png",         tilt: -2, tape: "rgba(201, 155, 63, 0.38)" },
  { name: "黑角",      img: "./assets/heijiao_1.png",         tilt: 4,  tape: "rgba(120, 100, 160, 0.3)" },
];

// 近期干员（rarity 为游戏星级，用于名字颜色）
window.RECENT_OPERATORS = [
  { name: "珊比",        rarity: 6 },
  { name: "予愿安洁莉娜", rarity: 6 },
  { name: "时隙",        rarity: 5 },
  { name: "嘉辛塔",      rarity: 5 },
];

window.POOL_OPERATORS = [
  { name: "提丰", rarity: 6, tag: "凭证兑换" },
  { name: "衡沙", rarity: 5, tag: "凭证兑换" },
  { name: "松桐", rarity: 5, tag: "中坚甄选" },
  { name: "云迹", rarity: 4, tag: "中坚甄选" },
];
