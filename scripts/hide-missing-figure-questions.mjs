// 隱藏「題幹說有圖、實際卻沒有圖」而無法作答的題目(設 needs_review = true)。
//
// 背景:孩子回報做題時看到「如圖…」卻沒有圖。全題庫稽核 56,608 題後發現:
//   - 圖片檔案遺失:0 處(所有 <img> 參照的檔案都在,沒有斷圖)
//   - 題幹/選項指涉附圖但整題沒有 <img>:53 題,逐題人工檢視後確認 45 題真的無法作答
//
// 為什麼要逐題檢視而不是用關鍵字一次隱藏:自動比對會大量誤判,例如
//   「在累積相對次數分配折線圖中…」「在物體的 x-t 圖中…」→ 概念題,不需附圖
//   「小英從圖書館…」「架上圖書潤」「在數線上圖示不等式」「幣面上圖案」→ 圖字黏在別的詞裡
//   「文字點畫如圖畫般優美」→ 如圖畫,不是指附圖
// 這些若被誤隱藏就是白白刪掉好題目,因此 EXCLUDED 明確列出已確認的誤判。
//
// 用法:node scripts/hide-missing-figure-questions.mjs [--dry] [--restore]
//   --dry     只列出不寫入
//   --restore 把這批題目改回 needs_review = false(日後補圖後可用)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEY = env.match(/SUPABASE_SECRET_KEY=(\S+)/)[1].trim();
const URL_BASE = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry");
const RESTORE = process.argv.includes("--restore");

/** 稽核判定「缺圖無法作答」的題目(已逐題人工檢視) */
const BROKEN = [
  // 國文:圖表題/海報/圖文題,圖未隨題轉出
  "chinese-0815086", "chinese-0825508", "chinese-0934849", "chinese-0946232",
  "chinese-0946373", "chinese-0946398", "chinese-1054131", "chinese-1054148",
  "chinese-1054178", "chinese-1063354", "chinese-1063364", "chinese-1180039",
  // 數學:摺紙/疊紙作圖題,沒有圖無法判斷
  "math-0810677", "math-0824191",
  // 自然:標示牌照片題
  "science-0822693",
  // 社會:氣候圖/地圖/人口金字塔/示意圖等(社會圖片版尚未轉換,為大宗)
  "social-0811224", "social-0811508", "social-0812093", "social-0815526",
  "social-0826106", "social-0828591", "social-0829669", "social-0937991",
  "social-0938007", "social-0939972", "social-0940723", "social-0944464",
  "social-1050012", "social-1060098", "social-1062918", "social-1080177",
  "social-1080189", "social-1080201", "social-1080235", "social-1080244",
  "social-1080246", "social-1080272", "social-1080277", "social-1080304",
  "social-9310210", "social-9311190", "social-9311887", "social-9312426",
  "social-9312486", "social-9312519",
];

/** 稽核時被關鍵字命中、但人工確認「其實可以作答」的誤判,保留不動 */
const EXCLUDED = {
  "chinese-0822866": "選項寫「文字點畫如圖畫般優美」——如圖畫,非指附圖",
  "chinese-0935097": "「小英從圖書館書架取下一本書」——從圖+書館",
  "chinese-1052631": "對聯「架上圖書潤」——架上+圖書",
  "math-0822860": "「在數線上圖示不等式」——線上+圖示",
  "math-0822861": "同上",
  "math-0822862": "同上",
  "math-0822863": "同上",
  "social-0826957": "「幣面上圖案為莫那魯道的肖像」——面上+圖案",
};

async function req(method, pathname, body) {
  const r = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    method, headers: { ...H, Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const target = RESTORE ? false : true;
console.log(RESTORE ? "↩️  還原:把這批題目改回可用" : "🙈 隱藏:缺圖無法作答的題目");
console.log(DRY ? "(乾跑,不寫入)\n" : "");
console.log(`對象 ${BROKEN.length} 題;確認誤判、保留不動 ${Object.keys(EXCLUDED).length} 題\n`);

if (!DRY) {
  // 分批更新,避免 URL 過長
  let done = 0;
  for (let i = 0; i < BROKEN.length; i += 25) {
    const batch = BROKEN.slice(i, i + 25);
    const rows = await req("PATCH", `questions?id=in.(${batch.join(",")})`, { needs_review: target });
    done += rows.length;
  }
  console.log(`✅ 已更新 ${done} 題 → needs_review = ${target}`);
} else {
  BROKEN.forEach((id) => console.log(`  ${id}`));
}

console.log("\n保留不動的誤判:");
for (const [id, why] of Object.entries(EXCLUDED)) console.log(`  ${id}  ${why}`);
