// 已上線題目「公式遺失」處理(2026-10-07)
//
// 問題:Word 方程式(分數、線段、根號、負指數)在轉檔時變成文字,分子分母黏在一起(6/35 →「635」)或整段消失,
//   孩子看到的是錯的題目。用 Word 轉的原檔逐題對照(data/rerender/vis-review/result-*.json)確認。
// 修法:題目/選項/答案有遺失 → 隱藏(needs_review = true);只有詳解壞掉 → 清空詳解,題目保留。
//
// 用法:node scripts/fix-visible-formula-loss.mjs <result.json…> [--apply] | --restore <備份檔>
import fs from "node:fs";
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const items = process.argv.slice(2).filter((a) => a.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).items);
const hide = items.filter((x) => x.verdict !== "same").map((x) => x.id);
const dropExpl = items.filter((x) => x.verdict === "same" && x.expl === "broken").map((x) => x.id);
const ids = [...new Set([...hide, ...dropExpl])];
const rows = await fetchAll(`questions?select=id,needs_review,explanation&id=in.(${ids.map(encodeURIComponent).join(",")})&order=id`);
const byId = new Map(rows.map((q) => [q.id, q]));
const missing = ids.filter((id) => !byId.has(id));
const changes = [
  ...hide.filter((id) => byId.get(id) && !byId.get(id).needs_review).map((id) => ({ id, patch: { needs_review: true } })),
  ...dropExpl.filter((id) => byId.get(id)?.explanation).map((id) => ({ id, patch: { explanation: null } })),
];
console.log(`隱藏 ${changes.filter((c) => "needs_review" in c.patch).length} 題、清空詳解 ${changes.filter((c) => "explanation" in c.patch).length} 題;資料庫找不到 ${missing.length}`, missing.join(" "));
for (const c of changes) console.log(`  ${c.id} → ${JSON.stringify(c.patch)}`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("visible-formula-loss", changes.map((c) => ({ id: c.id, needs_review: byId.get(c.id).needs_review, explanation: byId.get(c.id).explanation })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, c.patch));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/fix-visible-formula-loss.mjs --restore "${file}"`);
