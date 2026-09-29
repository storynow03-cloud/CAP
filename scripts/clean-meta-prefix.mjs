// 清理國文/自然/數學/英語題幹開頭的出題標註(與 clean-social-prefix.mjs 同一類問題,格式不同)。
//
// 這些科目的題幹開頭混著出題用標註,例如:
//   國文「核心素養：  主題：字形 知識點：JCH030101000000;JCHa20101000000「ㄧㄡ」點：」
//   自然「主題： 知識點：JNA020203000000 （ ）荷諾利用實驗室…」
//   數學「學習內容： S-8-8 知識點：JMA040204040000 如下圖，△ABC中…」
//   英語「知識點：　　Have you ever heard of the Oscars?…」
// 規則:從題幹最開頭起,只允許出現這幾種標籤(難易度/學習表現/學習內容/核心素養/能力指標/主題),
// 最後接「知識點：代碼」與作答括號,整段移除。任何其他文字出現在「知識點：」之前就不動,
// 避免誤刪真正的題目內容。
//
// 代碼一定要符合固定形狀(J + 兩個大寫 + 可選小寫 + 數字,如 JCH030101000000、JCHa20101000000),
// 否則英語題「知識點：　Have you ever…」會把 Have 誤當成代碼吃掉。
//
// 欄位回填(只在原本是空的時候):knowledge_code ← 第一個知識點代碼;
// curriculum_code ← 學習內容裡的課綱代碼(如數學 S-8-8)。
//
// 寫入前把原文備份到 git 外的備份資料夾,--restore 可還原。
// 用法:node scripts/clean-meta-prefix.mjs [--dry] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const env = fs.readFileSync(path.join(ROOT, "web", ".env.local"), "utf8");
const KEY = env.match(/SUPABASE_SECRET_KEY=(\S+)/)[1].trim();
const URL_BASE = env.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BACKUP_DIR = path.resolve(ROOT, "..", "國中會考-DB備份");
// 社會主要格式(能力指標…)已由 clean-social-prefix.mjs 處理;這裡補抓社會少數用
// 「核心素養/學習內容」標籤的變形
const SUBJECTS = ["chinese", "science", "math", "english", "social"];
const DRY = process.argv.includes("--dry");
const restoreIdx = process.argv.indexOf("--restore");

const CODE = String.raw`J[A-Z]{2}[a-z]?\d{8,}`;
// 課綱代碼(容許空白,如 Ad-IV -1、Ba-Ⅳ-1、S-8-8)
// 含 INc-IV-3 這種兩個大寫的,以及社會「地Bf-Ⅳ-2 / 歷La-Ⅳ-1」帶中文字首的
// 以及學習表現代碼「公1a-Ⅳ-1 / 社3b-IV-3」(字母部分是數字+小寫)
const CC = String.raw`(?:[地歷公社]?[A-Za-z]{1,2}[a-z]?|[地歷公社]\d[a-z])\s*-\s*(?:Ⅳ|IV|\d+)\s*-\s*\d+`;
// 部分題目的開頭少了「學習內容：」標籤,直接從課綱代碼(甚至被截斷的「-2　」)開始,
// 例:「Ba-Ⅳ-1, Ba-Ⅳ-2 主題：功與能 知識點：…」,所以允許開頭先有一串裸代碼。
const PREFIX = new RegExp(
  // 開頭殘片:被截斷的「-2　」或核心素養尾巴「A1 」(原本是「國-J-A1」)
  String.raw`^\s*(?<lead>(?:-?\d+\s+|[A-Z]\d\s+)?(?:${CC}[\s,，、]*)*)` +
  String.raw`(?<labels>(?:(?:難易度|學習表現|學習內容|核心素養|能力指標|主題)：[^：\n]*?\s*)*)` +
  String.raw`知識點：\s*(?<kc>${CODE}(?:[;；]${CODE})*)?\s*(?:[（(]\s*[）)])?\s*`
);
const CURRICULUM = new RegExp(CC);

async function fetchSubject(subject) {
  const rows = [];
  for (let off = 0; off < 20000; off += 1000) {
    const r = await fetch(
      `${URL_BASE}/rest/v1/questions?subject=eq.${subject}&question=like.${encodeURIComponent("*知識點：*")}` +
      `&select=id,question,knowledge_code,curriculum_code&order=id&limit=1000&offset=${off}`,
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
    if (attempt === 3) throw new Error(`PATCH ${id} → ${r.status}`);
    await new Promise((res) => setTimeout(res, 500 * attempt));
  }
}

async function runPool(items, worker, concurrency = 12) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

if (restoreIdx !== -1) {
  const backup = JSON.parse(fs.readFileSync(process.argv[restoreIdx + 1], "utf8"));
  await runPool(backup, (b) => patch(b.id, { question: b.question, knowledge_code: b.knowledge_code, curriculum_code: b.curriculum_code }));
  console.log(`✅ 已還原 ${backup.length} 題`);
  process.exit(0);
}

const plan = [];
const skipped = [];
for (const subject of SUBJECTS) {
  for (const q of await fetchSubject(subject)) {
    const text = String(q.question ?? "");
    const m = text.match(PREFIX);
    if (!m) { skipped.push({ subject, id: q.id, head: text.slice(0, 50) }); continue; }
    const cleaned = text.slice(m[0].length);
    // 國文字義題本來就很短(題幹「兜：」、答案「繞、轉」),門檻只擋「幾乎什麼都沒剩」
    if (cleaned.replace(/<[^>]+>/g, "").trim().length < 2) { skipped.push({ subject, id: q.id, head: "(清完太短)" + text.slice(0, 40) }); continue; }
    const body = { question: cleaned };
    const firstKc = m.groups.kc?.split(/[;；]/)[0];
    if (!q.knowledge_code && firstKc) body.knowledge_code = firstKc;
    // 課綱代碼優先取「學習內容：」後面的,沒有標籤時取開頭那串裸代碼;去掉中間空白統一格式
    const ccSrc = m.groups.labels.match(/學習內容：[^：]*/)?.[0] ?? m.groups.lead;
    const cc = ccSrc?.match(CURRICULUM)?.[0].replace(/\s+/g, "");
    if (!q.curriculum_code && cc) body.curriculum_code = cc;
    plan.push({ subject, id: q.id, body, before: { question: q.question, knowledge_code: q.knowledge_code, curriculum_code: q.curriculum_code } });
  }
}

const bySubj = {};
for (const p of plan) bySubj[p.subject] = (bySubj[p.subject] || 0) + 1;
console.log(`要清理:${plan.length} 題`, JSON.stringify(bySubj));
console.log(`不符規則、不動:${skipped.length} 題`);
skipped.slice(0, 8).forEach((s) => console.log(`   [${s.subject}] ${s.id} ${JSON.stringify(s.head)}`));
console.log(`補 knowledge_code:${plan.filter((p) => p.body.knowledge_code).length};補 curriculum_code:${plan.filter((p) => p.body.curriculum_code).length}`);
console.log("\n前後範例:");
const shown = {};
for (const p of plan) {
  shown[p.subject] = (shown[p.subject] || 0) + 1;
  if (shown[p.subject] > 1) continue;
  console.log(`  ${p.id}\n    前:${JSON.stringify(String(p.before.question).slice(0, 80))}\n    後:${JSON.stringify(String(p.body.question).slice(0, 60))}`);
}
if (DRY) { console.log("\n(乾跑,未寫入)"); process.exit(0); }

const dir = path.join(BACKUP_DIR, `${new Date().toISOString().slice(0, 10)}-meta-prefix`);
fs.mkdirSync(dir, { recursive: true });
// 檔名帶時間戳記:同一天重跑時不可覆蓋前一次的備份(曾經因此蓋掉一份 1,316 題的備份)
const backupFile = path.join(dir, `original-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(backupFile, JSON.stringify(plan.map((p) => ({ id: p.id, ...p.before }))), "utf8");
console.log(`\n💾 已備份 → ${backupFile}`);
await runPool(plan, (p) => patch(p.id, p.body));
console.log(`✅ 已清理 ${plan.length} 題`);
console.log(`還原:node scripts/clean-meta-prefix.mjs --restore "${backupFile}"`);
