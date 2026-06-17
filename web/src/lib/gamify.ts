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

// ===== 商城(資料庫驅動,目錄存在 shop_categories / shop_items)=====
export type ShopItemType = "theme" | "frame" | "nameplate" | "title" | "food" | "booster";

// 稀有度(顯示樣式)
export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITY: Record<Rarity, { label: string; ring: string; chip: string; glow: string }> = {
  common:    { label: "普通", ring: "ring-1 ring-slate-200",  chip: "bg-slate-100 text-slate-500",  glow: "" },
  rare:      { label: "稀有", ring: "ring-2 ring-sky-300",    chip: "bg-sky-100 text-sky-700",      glow: "shadow-[0_0_0_2px_rgba(56,189,248,.25)]" },
  epic:      { label: "史詩", ring: "ring-2 ring-violet-300", chip: "bg-violet-100 text-violet-700", glow: "shadow-[0_0_14px_rgba(139,92,246,.45)]" },
  legendary: { label: "傳說", ring: "ring-2 ring-amber-300",  chip: "bg-amber-100 text-amber-700",   glow: "shadow-[0_0_18px_rgba(245,158,11,.6)]" },
};
export const rarityOf = (r: string | null | undefined): Rarity =>
  (["common", "rare", "epic", "legendary"].includes(r ?? "") ? r : "common") as Rarity;
export const SHOP_TYPE_LABEL: Record<string, string> = {
  theme: "🎨 主題色", frame: "🖼️ 頭像框", nameplate: "🏷️ 名牌底圖", title: "🏅 稱號",
  food: "🍖 寵物食物", booster: "⚡ 加成道具",
};

// get_shop RPC 回傳列(含今日折扣價與精選旗標)
export interface ShopRow {
  id: number;
  key: string;
  label: string;
  type: ShopItemType | string;
  value: string;
  price: number;
  rarity: string;
  sort: number;
  effective_price: number;
  is_featured: boolean;
}

export interface ShopCategory {
  id: number;
  name: string;
  type: ShopItemType | string;
  sort: number;
}

export interface ShopItem {
  id: number;
  category_id: number | null;
  key: string;            // 穩定識別碼(user_items.key / equipped_* 都參照這個)
  label: string;
  price: number;
  type: ShopItemType | string;
  value: string;          // theme: 主色 hex;frame: emoji;nameplate: 漸層;title: 文字;food: 好感度點數
  active: boolean;
  sort: number;
  rarity?: string;
}

/** 最小化的 supabase client 介面(server / browser 兩種 client 都符合)*/
type ShopQueryable = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string) => PromiseLike<{ data: ShopItem[] | null }>;
    };
  };
};

/** 讀取商城商品(含 inactive,讓「使用中/已擁有」的舊商品仍能解析名稱/數值)。
 *  前端商城列表自行用 active 過濾。 */
export async function fetchShopItems(supabase: ShopQueryable): Promise<ShopItem[]> {
  const { data } = await supabase.from("shop_items").select("*").order("sort");
  return data ?? [];
}

export const DEFAULT_THEME = "#4f46e5";
export const itemByKey = (
  items: ShopItem[],
  key: string | null | undefined,
) => items.find((i) => i.key === key);

// ===== 學習夥伴(資料庫驅動:pet_defs 表,管理者可 CRUD,3 階段進化)=====
// 夥伴外觀改由 DB 管理:每隻有 3 階段(幼年/成長期/完全體),可放 emoji 或上傳圖片。
export interface PetDef {
  id: number;
  key: string;
  name: string;
  origin: string;
  kind: "emoji" | "image" | string; // stage 內容是 emoji 還是圖片 URL
  stage1: string;
  stage2: string;
  stage3: string;
  rarity?: string;
  price?: number;
  is_custom?: boolean;
  owner?: string | null;
  active?: boolean;
  sort?: number;
  is_legendary?: boolean;   // 僅決定「華麗特效」外觀
  bonus_xp?: number;        // 作答 XP +%
  bonus_coins?: number;     // 作答金幣 +%
  bonus_affection?: number; // 每答對 +好感度
  bonus_subjects?: string[];// 加成生效的考科(空=全科)
}

/** 讀取夥伴目錄(RLS:公開夥伴 + 自己的自訂夥伴)*/
type PetsQueryable = {
  from: (table: string) => {
    select: (cols: string) => { order: (col: string) => PromiseLike<{ data: PetDef[] | null }> };
  };
};
export async function fetchPets(supabase: PetsQueryable): Promise<PetDef[]> {
  const { data } = await supabase.from("pet_defs").select("*").order("sort");
  return data ?? [];
}
/** 某 def 在某階段的外觀值(emoji 或圖 URL)*/
export function petStageValue(def: PetDef | undefined, stage: number): string {
  if (!def) return "🐾";
  return stage <= 0 ? def.stage1 : stage === 1 ? def.stage2 : def.stage3;
}


// 進化條件:3 階段(幼年→成長期→完全體),每階段需「等級 + 好感度」雙達標(讀書 + 照顧)
export const STAGE_REQ: { level: number; affection: number }[] = [
  { level: 0, affection: 0 },     // 幼年:一開始
  { level: 5, affection: 50 },    // 成長期:要餵養
  { level: 12, affection: 200 },  // 完全體:要長期照顧
];
export const STAGE_NAMES = ["幼年", "成長期", "完全體"];
export const FINAL_STAGE = STAGE_REQ.length - 1; // 2

/** 由等級 + 好感度決定進化階段(0..2)。affection 省略時只看等級。 */
export function petStage(level: number, affection: number = Number.POSITIVE_INFINITY): number {
  let s = 0;
  for (let i = 1; i < STAGE_REQ.length; i++) {
    if (level >= STAGE_REQ[i].level && affection >= STAGE_REQ[i].affection) s = i;
    else break;
  }
  return s;
}
/** 下一階段的條件(已完全體回 null)*/
export function nextStageReq(level: number, affection: number): { stage: number; level: number; affection: number } | null {
  const s = petStage(level, affection);
  if (s >= STAGE_REQ.length - 1) return null;
  return { stage: s + 1, ...STAGE_REQ[s + 1] };
}

// ===== 寵物好感度(餵食累積)=====
// 親密度分 5 級(0~4),門檻為「累積好感度」。
export const AFFECTION_TIERS = [0, 50, 150, 300, 500];
export const MAX_AFFECTION_LEVEL = AFFECTION_TIERS.length - 1;
/** 由累積好感度算出親密度等級(0~4)*/
export function petAffectionLevel(affection: number): number {
  let lv = 0;
  for (let i = 1; i < AFFECTION_TIERS.length; i++) if (affection >= AFFECTION_TIERS[i]) lv = i;
  return lv;
}
/** 回傳目前級內進度(供愛心條使用)*/
export function affectionProgress(affection: number): { level: number; into: number; span: number; toNext: number } {
  const level = petAffectionLevel(affection);
  if (level >= MAX_AFFECTION_LEVEL)
    return { level, into: 1, span: 1, toNext: 0 };
  const base = AFFECTION_TIERS[level];
  const span = AFFECTION_TIERS[level + 1] - base;
  return { level, into: affection - base, span, toNext: AFFECTION_TIERS[level + 1] - affection };
}
export const AFFECTION_NAMES = ["陌生", "熟悉", "親近", "信賴", "形影不離"];

// 夥伴心情(由「距上次照顧的天數」決定)
export const PET_MOODS = [
  { emoji: "😊", name: "開心" },     // 今天有照顧
  { emoji: "🙂", name: "還不錯" },   // 1 天沒
  { emoji: "😟", name: "想你了" },   // 2 天沒
  { emoji: "😢", name: "好寂寞" },   // 3 天以上
];
export function petMood(daysSinceCare: number) {
  const i = Math.min(PET_MOODS.length - 1, Math.max(0, daysSinceCare));
  return { ...PET_MOODS[i], level: i };
}


// 作答時寵物打氣台詞(親密度越高越熱情)
const CHEER = {
  correctHigh: ["太棒了!我就知道你最厲害 💛", "答對啦!跟你一起變強好開心!", "完美!我們是最佳拍檔 ✨", "厲害!你越來越強了呢!"],
  correctLow: ["答對了,做得好!👍", "不錯喔,繼續加油!", "答對啦!", "很好,保持下去!"],
  wrongHigh: ["沒關係,我永遠相信你 💪", "再試一次,我會一直陪著你!", "別灰心,下一題一定行 💛", "失敗是變強的開始,加油!"],
  wrongLow: ["沒關係,再接再厲!", "別氣餒,看一下詳解吧!", "下一題加油!", "錯了沒關係,記起來就好!"],
};
/** 依好感度與答對與否,隨機回一句打氣台詞 */
export function petCheer(affection: number, correct: boolean): string {
  const intimate = petAffectionLevel(affection) >= 2;
  const pool = correct
    ? intimate ? CHEER.correctHigh : CHEER.correctLow
    : intimate ? CHEER.wrongHigh : CHEER.wrongLow;
  return pool[Math.floor(Math.random() * pool.length)];
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
