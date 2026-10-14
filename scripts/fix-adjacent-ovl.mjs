// 相鄰線段上劃線分開(2026-10-10,題目修正清單 #1、#2)
// 背景:原檔「∵AD//BC」換行「AC 為∠BCD的角平分線」,轉檔時換行被吃掉 → 兩個 <span class="ovl"> 直接相鄰,
//       畫面上上劃線連成一條「BCAC」。已用原檔 token(data/rerender/formula-audit/tokens.json)逐處確認中間都是換行、沒有缺符號。
// 做法:全庫 question / options / explanation / answer_text 中,ovl 結尾後緊接 ovl 開頭的地方補一個空白。
// 用法:node scripts/fix-adjacent-ovl.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const RE = /(<span class="ovl">(?:(?!<\/?span)[\s\S])*<\/span>)(?=<span class="ovl">)/g;
const fix = (s) => (typeof s === "string" ? s.replace(RE, "$1 ") : s);

const rows = await fetchAll(`questions?select=id,needs_review,question,options,explanation,answer_text&or=(question.like.*ovl*,explanation.like.*ovl*,answer_text.like.*ovl*,options.cs.{},options.is.null)&order=id`);
const plan = [];
let spots = 0;
for (const q of rows) {
  const patch = {}, before = {};
  for (const f of ["question", "explanation", "answer_text"]) {
    const n = (q[f] ?? "").match(RE)?.length ?? 0;
    if (n) { patch[f] = fix(q[f]); before[f] = q[f]; spots += n; }
  }
  if (Array.isArray(q.options) && q.options.some((o) => RE.test(String(o)) && (RE.lastIndex = 0, true))) {
    RE.lastIndex = 0;
    spots += q.options.reduce((c, o) => c + (String(o).match(RE)?.length ?? 0), 0);
    patch.options = q.options.map(fix); before.options = q.options;
  }
  if (Object.keys(patch).length) plan.push({ id: q.id, hidden: q.needs_review, patch, before });
}
console.log(`掃描 ${rows.length} 題 → ${plan.length} 題、${spots} 處相鄰線段(可見 ${plan.filter((p) => !p.hidden).length} 題)`);
for (const p of plan.slice(0, 5)) for (const [f, v] of Object.entries(p.patch)) {
  const s = JSON.stringify(v); const i = s.search(/<\/span> <span class=\\"ovl/);
  console.log(`  ${p.id} ${f}: …${s.slice(Math.max(0, i - 60), i + 60).replace(/<[^>]+>/g, "")}…`);
}
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("adjacent-ovl", plan.map((p) => ({ id: p.id, ...p.before })));
console.log(`💾 備份 → ${file}`);
await runPool(plan, (p) => patchQuestion(p.id, p.patch));
console.log(`✅ 已寫入 ${plan.length} 題。還原:node scripts/fix-adjacent-ovl.mjs --restore "${file}"`);
