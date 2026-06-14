// 遊戲化:等級曲線、成就定義、商城目錄

/** 由總 XP 算出等級與該級進度 */
export function levelFromXp(xp: number) {
  let level = 1;
  let acc = 0;
  let need = 100; // 升到 Lv2 需要 100,之後每級 +50
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = 100 + (level - 1) * 50;
  }
  return { level, intoLevel: xp - acc, levelSpan: need, toNext: acc + need - xp };
}

export interface QuestRow {
  key: string;
  label: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  completed: boolean;
}

// ===== 成就 =====
export interface AchievementDef {
  key: string;
  emoji: string;
  label: string;
  desc: string;
  check: (s: AchStats) => boolean;
}
export interface AchStats {
  streakDays: number;
  totalCorrect: number;
  totalAnswered: number;
  maxTopicLevel: number;
  masteredTopics: number; // level>=4 的單元數
  conquered: number; // 已克服錯題數
  examCount: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_step", emoji: "👣", label: "踏出第一步", desc: "完成第 1 題", check: (s) => s.totalAnswered >= 1 },
  { key: "answer_100", emoji: "💯", label: "百題達成", desc: "累計答對 100 題", check: (s) => s.totalCorrect >= 100 },
  { key: "answer_500", emoji: "🔥", label: "刷題高手", desc: "累計答對 500 題", check: (s) => s.totalCorrect >= 500 },
  { key: "streak_3", emoji: "📅", label: "三日不間斷", desc: "連續達標 3 天", check: (s) => s.streakDays >= 3 },
  { key: "streak_7", emoji: "🗓️", label: "一週不斷電", desc: "連續達標 7 天", check: (s) => s.streakDays >= 7 },
  { key: "streak_30", emoji: "🏅", label: "月度鐵人", desc: "連續達標 30 天", check: (s) => s.streakDays >= 30 },
  { key: "master_1", emoji: "⭐", label: "初露鋒芒", desc: "任一單元達精熟(Lv4)", check: (s) => s.maxTopicLevel >= 4 },
  { key: "master_5", emoji: "🌟", label: "五項精熟", desc: "5 個單元達精熟", check: (s) => s.masteredTopics >= 5 },
  { key: "challenger", emoji: "⚔️", label: "挑戰者", desc: "任一單元達挑戰級(Lv5)", check: (s) => s.maxTopicLevel >= 5 },
  { key: "conquer_10", emoji: "🛡️", label: "克服弱點", desc: "克服 10 題錯題", check: (s) => s.conquered >= 10 },
  { key: "conquer_50", emoji: "🏆", label: "錯題終結者", desc: "克服 50 題錯題", check: (s) => s.conquered >= 50 },
  { key: "exam_5", emoji: "🎯", label: "模考常客", desc: "完成 5 次模擬考", check: (s) => s.examCount >= 5 },
];

// ===== 商城 =====
export interface ShopItem {
  key: string;
  label: string;
  price: number;
  type: "theme" | "frame";
  value: string; // theme: 主色 hex;frame: emoji 邊框
}

export const SHOP_ITEMS: ShopItem[] = [
  // 主題色(改變介面主色)
  { key: "theme_indigo", label: "靛藍(預設)", price: 0, type: "theme", value: "#4f46e5" },
  { key: "theme_rose", label: "玫瑰紅", price: 100, type: "theme", value: "#e11d48" },
  { key: "theme_emerald", label: "翡翠綠", price: 100, type: "theme", value: "#059669" },
  { key: "theme_amber", label: "琥珀橙", price: 100, type: "theme", value: "#d97706" },
  { key: "theme_violet", label: "紫羅蘭", price: 150, type: "theme", value: "#7c3aed" },
  { key: "theme_cyan", label: "天青藍", price: 150, type: "theme", value: "#0891b2" },
  { key: "theme_pink", label: "櫻花粉", price: 200, type: "theme", value: "#db2777" },
  { key: "theme_slate", label: "石墨黑", price: 200, type: "theme", value: "#334155" },
  // 頭像框(emoji 裝飾)
  { key: "frame_star", label: "星星框", price: 120, type: "frame", value: "⭐" },
  { key: "frame_fire", label: "火焰框", price: 120, type: "frame", value: "🔥" },
  { key: "frame_crown", label: "皇冠框", price: 300, type: "frame", value: "👑" },
  { key: "frame_rainbow", label: "彩虹框", price: 300, type: "frame", value: "🌈" },
];

export const DEFAULT_THEME = "#4f46e5";
export const itemByKey = (key: string | null | undefined) =>
  SHOP_ITEMS.find((i) => i.key === key);

// ===== 學習夥伴(寵物,隨等級進化)=====
export interface PetDef {
  key: string;
  name: string;
  stages: [string, string, string, string]; // 蛋 → 幼 → 成長 → 完全體
}
export const PETS: PetDef[] = [
  { key: "cat", name: "貓貓", stages: ["🥚", "🐱", "🐈", "🦁"] },
  { key: "dog", name: "狗狗", stages: ["🥚", "🐶", "🐕", "🐺"] },
  { key: "dragon", name: "龍龍", stages: ["🥚", "🦎", "🐲", "🐉"] },
  { key: "bird", name: "鳥鳥", stages: ["🥚", "🐤", "🐦", "🦅"] },
];
/** 由等級決定進化階段 */
export function petStage(level: number): number {
  if (level >= 15) return 3;
  if (level >= 7) return 2;
  if (level >= 3) return 1;
  return 0;
}
export const STAGE_NAMES = ["蛋", "幼年", "成長期", "完全體"];
export function petEmoji(petKey: string | null | undefined, level: number): string {
  const p = PETS.find((x) => x.key === petKey) ?? PETS[0];
  return p.stages[petStage(level)];
}

// ===== 王關(每週輪替)=====
export const BOSSES = [
  { key: "calc", emoji: "🧮", name: "計算魔王", subject: "math", desc: "數學難題 10 連戰" },
  { key: "science", emoji: "🔬", name: "自然霸主", subject: "science", desc: "自然難題 10 連戰" },
  { key: "social", emoji: "🗺️", name: "社會王者", subject: "social", desc: "社會難題 10 連戰" },
  { key: "chinese", emoji: "📜", name: "國文宗師", subject: "chinese", desc: "國文難題 10 連戰" },
];
/** 本週是第幾週(用來輪 boss + 通關紀錄 key)*/
export function currentWeekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
export function thisWeekBoss() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - onejan.getTime()) / (7 * 86400000));
  return BOSSES[week % BOSSES.length];
}
export const BOSS_PASS = 7; // 答對幾題算通關
export const BOSS_REWARD = { xp: 200, coins: 100 };

/** 把 hex 顏色加深(做漸層用),避免依賴瀏覽器 color-mix */
export function darken(hex: string, factor = 0.62): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
