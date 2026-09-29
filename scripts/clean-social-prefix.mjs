// 清理社會科題幹開頭的後台代碼,並把代碼搬進對應欄位。
//
// 問題:社會科幾乎每一題的題幹開頭都是
//   「能力指標：社1a-IV-1;地Aa-IV-1; 主題：世界中的臺灣 知識點：JSG010101010000（  ）下列何者…」
// 孩子每做一題社會都要先讀過這串代碼才看到題目。這是康軒原始檔把出題用的標註跟題目寫在
// 同一段,轉檔時沒拆開。
//
// 同時這串代碼正是社會科缺的資料:社會的 knowledge_code 欄位原本只有 60 題有值,
// 考卷診斷要「依知識點找題」必須有它。所以一次做兩件事:
//   1. 題幹移除「能力指標…主題…知識點：代碼」與緊接的作答括號「（  ）」
//   2. knowledge_code ← 知識點代碼(JSG010101010000 這種);
//      curriculum_code ← 能力指標裡第一個「學習內容」代碼(地Aa-IV-1 / 歷La-Ⅳ-1 / 公Ba-Ⅳ-3)
//      只在欄位原本是空的時候填,不覆蓋既有值。
//
// 安全措施:寫入前把每題原始的 question / knowledge_code / curriculum_code 備份到 git 外的
// 備份資料夾(題庫有版權,不進 git),--restore 可完整還原。
//
// 用法:
//   node scripts/clean-social-prefix.mjs --dry      只分析不寫入
//   node scripts/clean-social-prefix.mjs            執行(自動先備份)
//   node scripts/clean-social-prefix.mjs --restore <備份檔路徑>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEY = env.match(/SUPABASE_SECRET_KEY=(\S+)/)[1].trim();
const URL_BASE = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");

const DRY = process.argv.includes("--dry");
const restoreIdx = process.argv.indexOf("--restore");

// 開頭樣式:能力指標：<代碼們> 主題：<主題> 知識點：<代碼或空白> 後面接作答括號
const PREFIX =
  /^\s*能力指標：(?<ind>[^\n]*?)\s*主題：(?<theme>[^\n]*?)\s*知識點：\s*(?<kc>[A-Z]{3}\d{12})?\s*(?:[（(]\s*[）)])?\s*/;
// 學習內容代碼:地/歷/公 + 大寫 + 小寫 - 第四學習階段 - 序號
const CONTENT_CODE = /[地歷公][A-Z][a-z]-(?:Ⅳ|IV)-\d+/;

async function fetchAll() {
  const rows = [];
  for (let off = 0; off < 40000; off += 1000) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/questions?subject=eq.social&select=id,question,knowledge_code,curriculum_code&order=id&limit=1000&offset=${off}`,
      { headers: H }
    );
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) break;
    rows.push(...d);
    if (d.length < 1000) break;
  }
  return rows;
}

async function patch(id, body) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${URL_BASE}/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
    });
    if (r.ok) return;
    if (attempt === 3) throw new Error(`PATCH ${id} → ${r.status} ${(await r.text()).slice(0, 150)}`);
    await new Promise((res) => setTimeout(res, 500 * attempt));
  }
}

/** 以固定併發數跑完所有工作,並定期回報進度 */
async function runPool(items, worker, concurrency = 16) {
  let next = 0, done = 0;
  const total = items.length;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < total) {
      const item = items[next++];
      await worker(item);
      done++;
      if (done % 2000 === 0 || done === total) console.log(`   進度 ${done}/${total}`);
    }
  }));
}

// ---------- 還原模式 ----------
if (restoreIdx !== -1) {
  const file = process.argv[restoreIdx + 1];
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`↩️  從 ${file} 還原 ${backup.length} 題`);
  await runPool(backup, (b) => patch(b.id, {
    question: b.question, knowledge_code: b.knowledge_code, curriculum_code: b.curriculum_code,
  }));
  console.log("✅ 還原完成");
  process.exit(0);
}

// ---------- 分析 ----------
const rows = await fetchAll();
const plan = [];
let noPrefix = 0, tooShort = [];
for (const q of rows) {
  const text = String(q.question ?? "");
  const m = text.match(PREFIX);
  if (!m) { noPrefix++; continue; }

  const cleaned = text.slice(m[0].length);
  if (cleaned.replace(/<[^>]+>/g, "").trim().length < 5) { tooShort.push(q.id); continue; }

  const body = { question: cleaned };
  if (!q.knowledge_code && m.groups.kc) body.knowledge_code = m.groups.kc;
  const cc = m.groups.ind.match(CONTENT_CODE)?.[0];
  if (!q.curriculum_code && cc) body.curriculum_code = cc;

  plan.push({ id: q.id, body, before: { question: q.question, knowledge_code: q.knowledge_code, curriculum_code: q.curriculum_code } });
}

const fillKc = plan.filter((p) => p.body.knowledge_code).length;
const fillCc = plan.filter((p) => p.body.curriculum_code).length;
console.log(`社會科共 ${rows.length} 題`);
console.log(`  要清理題幹:${plan.length} 題`);
console.log(`  無前綴(不動):${noPrefix} 題`);
console.log(`  清理後剩太短(跳過、需人工看):${tooShort.length} 題 ${tooShort.slice(0, 5).join(", ")}`);
console.log(`  補上 knowledge_code:${fillKc} 題`);
console.log(`  補上 curriculum_code:${fillCc} 題`);
console.log("\n清理前後範例:");
for (const p of plan.slice(0, 3).concat(plan.filter((x) => !x.body.knowledge_code).slice(0, 1))) {
  const b = String(p.before.question).replace(/<[^>]+>/g, "").slice(0, 90).replace(/\n/g, "⏎");
  const a = String(p.body.question).replace(/<[^>]+>/g, "").slice(0, 60).replace(/\n/g, "⏎");
  console.log(`  ${p.id}\n    前:${b}\n    後:${a}\n    kc=${p.body.knowledge_code ?? "(不變)"} cc=${p.body.curriculum_code ?? "(不變)"}`);
}

if (DRY) { console.log("\n(乾跑,未寫入)"); process.exit(0); }

// ---------- 備份 + 寫入 ----------
const stamp = new Date().toISOString().slice(0, 10);
const dir = path.join(BACKUP_DIR, `${stamp}-social-prefix`);
fs.mkdirSync(dir, { recursive: true });
// 檔名帶時間戳記,同一天重跑不會覆蓋前一次的備份
const backupFile = path.join(dir, `original-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(backupFile, JSON.stringify(plan.map((p) => ({ id: p.id, ...p.before }))), "utf8");
console.log(`\n💾 已備份 ${plan.length} 題原文 → ${backupFile}`);

console.log("✍️  開始寫入…");
await runPool(plan, (p) => patch(p.id, p.body));
console.log("✅ 完成");
console.log(`還原指令:node scripts/clean-social-prefix.mjs --restore "${backupFile}"`);
