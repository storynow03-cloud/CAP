// 寫入公式補回(2026-10-07 全面稽核)
// 來源:data/rerender/formula-audit/repair-plan.json(scripts/repair-formula-gaps.mjs 產生,1,137 題逐題看圖複核過)
//   - EXCLUDE:複核發現公式放錯位置的題目 → 不補(交給殘留處理:隱藏或清詳解)
//   - manual-edits.json:舊 restore 補回 Word 隱形欄位(\eq\r(…) 無空白)造成的重複公式 → 精準移除
// 安全:寫入前逐欄確認資料庫現值 == 計畫的 before(有人改過就跳過);先備份,可 --restore。
// 用法:node scripts/apply-formula-repair.mjs [--local] [--apply] | --restore <備份檔>
//   --local:不碰資料庫,把結果寫到 data/rerender/formula-audit/db-final.json(給稽核算殘留用)
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const D = path.join(ROOT, "data/rerender/formula-audit");
const LOCAL = process.argv.includes("--local");
const APPLY = process.argv.includes("--apply");
// 複核判定「公式放錯位置」:不補
const EXCLUDE = new Set(["math-0930889", "math-1051024", "math-1051576"]); // 2026-10-07 複核:放錯位置

const plan = JSON.parse(fs.readFileSync(path.join(D, "repair-plan.json"), "utf8")).filter((p) => p.inserted.length && !EXCLUDE.has(p.id));
// --edits <檔名>:手動修正清單(預設 manual-edits.json);{"all": true} = 全部取代(至少要有一處)
const EDITS = process.argv.includes("--edits") ? process.argv[process.argv.indexOf("--edits") + 1] : "manual-edits.json";
const edits = JSON.parse(fs.readFileSync(path.join(D, EDITS), "utf8"));
// --with-hidden <json 陣列檔>:這些已隱藏的題目也要修(修完是否放回另外決定)
const WITH = process.argv.includes("--with-hidden") ? new Set(JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--with-hidden") + 1], "utf8"))) : new Set();
const ids = [...new Set([...plan.map((p) => p.id), ...edits.map((e) => e.id)])];

let rows;
if (LOCAL) rows = JSON.parse(fs.readFileSync(path.join(D, "db.json"), "utf8")).filter((q) => ids.includes(q.id));
else {
  rows = [];
  for (let i = 0; i < ids.length; i += 80) {
    rows.push(...(await fetchAll(`questions?select=id,question,passage,options,answer_text,explanation,needs_review&id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(",")})`)));
  }
}
const byId = new Map(rows.map((q) => [q.id, q]));
const after = new Map(); // id → 修改後的欄位
const get = (id, f) => (after.get(id)?.[f] !== undefined ? after.get(id)[f] : structuredClone(byId.get(id)[f]));
const set = (id, f, v) => { if (!after.has(id)) after.set(id, {}); after.get(id)[f] = v; };
const skipped = [];
for (const p of plan) {
  const q = byId.get(p.id);
  if (!q) { skipped.push(`${p.id}:資料庫找不到`); continue; }
  if (q.needs_review && !WITH.has(p.id)) { skipped.push(`${p.id}:已隱藏`); continue; }
  const cur = get(p.id, p.field);
  const curVal = p.k === null ? cur : cur?.[p.k];
  if (curVal !== p.before) { skipped.push(`${p.id} ${p.field}:現值與計畫不同(有人改過)`); continue; }
  if (p.k === null) set(p.id, p.field, p.after);
  else { const arr = [...cur]; arr[p.k] = p.after; set(p.id, p.field, arr); }
}
for (const e of edits) {
  const cur = get(e.id, e.field);
  const n = typeof cur === "string" ? cur.split(e.find).length - 1 : 0;
  if (e.all ? n < 1 : n !== 1) { skipped.push(`${e.id} ${e.field}:手動修正字串${e.all ? "找不到" : "不唯一或找不到"}`); continue; }
  set(e.id, e.field, e.all ? cur.split(e.find).join(e.replace) : cur.replace(e.find, e.replace));
}
const changes = [...after].map(([id, patch]) => ({ id, patch }));
const fieldN = changes.reduce((a, c) => a + Object.keys(c.patch).length, 0);
console.log(`要修改 ${changes.length} 題(${fieldN} 個欄位;公式補回 ${plan.length} 欄、手動 ${edits.length} 處);跳過 ${skipped.length}`);
for (const s of skipped) console.log("  跳過", s);

if (LOCAL) {
  const db = JSON.parse(fs.readFileSync(path.join(D, "db.json"), "utf8"));
  for (const q of db) if (after.has(q.id)) Object.assign(q, after.get(q.id));
  fs.writeFileSync(path.join(D, "db-final.json"), JSON.stringify(db));
  console.log("→ data/rerender/formula-audit/db-final.json(本機模擬,未寫入資料庫)");
  process.exit(0);
}
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("formula-repair", changes.map((c) => ({ id: c.id, ...Object.fromEntries(Object.keys(c.patch).map((f) => [f, byId.get(c.id)[f]])) })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, c.patch));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/apply-formula-repair.mjs --restore "${file}"`);
