// 公式補回後的殘留處理(2026-10-07):子代理看圖分類結果 → 隱藏或清空詳解
//   core(題幹/選項/答案缺或錯)→ needs_review = true(隱藏,學生看不到)
//   expl(只有詳解缺)→ explanation = null(題目保留)
//   ok(程式誤報)/ unsure → 不動(unsure 另列給 Claude 親自看)
// 必須在 apply-formula-repair.mjs 寫入之後執行(清詳解會蓋掉補回的詳解,屬預期:殘留表示補完仍缺)。
// 用法:node scripts/apply-residual-actions.mjs [--apply] | --restore <備份檔>
//   可另給 --override <json>:{id: "core"|"expl"|"ok"}(Claude 親自看過後覆寫子代理判定)
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const dir = path.join(ROOT, "data/rerender/residual-review/results");
const verdict = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  for (const x of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).items) verdict[x.id] = x;
}
const ovIdx = process.argv.indexOf("--override");
if (ovIdx !== -1) {
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(process.argv[ovIdx + 1], "utf8")))) verdict[id] = { ...(verdict[id] ?? { id }), verdict: v, why: `${verdict[id]?.why ?? ""}(Claude 覆寫:${v})` };
}
const ids = Object.keys(verdict);
const rows = [];
for (let i = 0; i < ids.length; i += 80) {
  rows.push(...(await fetchAll(`questions?select=id,needs_review,explanation&id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(",")})`)));
}
const byId = new Map(rows.map((q) => [q.id, q]));
const changes = [];
const count = {};
for (const [id, v] of Object.entries(verdict)) {
  count[v.verdict] = (count[v.verdict] ?? 0) + 1;
  const q = byId.get(id);
  if (!q) continue;
  if (v.verdict === "core" && !q.needs_review) changes.push({ id, patch: { needs_review: true }, why: v.why });
  if (v.verdict === "expl" && q.explanation && !q.needs_review) changes.push({ id, patch: { explanation: null }, why: v.why });
}
console.log("判定:", count);
console.log(`隱藏 ${changes.filter((c) => "needs_review" in c.patch).length} 題、清空詳解 ${changes.filter((c) => "explanation" in c.patch).length} 題`);
for (const c of changes.slice(0, 8)) console.log(`  ${c.id} ${JSON.stringify(c.patch)} ${c.why.slice(0, 60)}`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("formula-residual", changes.map((c) => ({ id: c.id, needs_review: byId.get(c.id).needs_review, explanation: byId.get(c.id).explanation })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, c.patch));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/apply-residual-actions.mjs --restore "${file}"`);
