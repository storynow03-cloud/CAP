// 撤回 fix-visible-formula-loss 的誤判(2026-10-07 晚)
// 起因:sci-compare-sheets.py 的 conv() 把 .frac 標籤直接拿掉,6/35 顯示成「635」→ 23 題中 15 題誤判。
// 以 make-recheck-page.mjs + shoot-recheck.py(網站實際 CSS)逐題重看 Word 原檔後確認:
//   放回 9 題(needs_review → false)、詳解寫回 6 題(從 visible-formula-loss 備份取)。真的壞的 8 題維持隱藏。
// 用法:node scripts/undo-formula-false-positives.mjs <visible-formula-loss 備份.json> [--apply] | --restore <本腳本的備份>
import fs from "node:fs";
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const UNHIDE = ["math-0811404", "math-0811704", "math-0811823", "math-0812144", "math-0813005", "math-0932065", "math-0941914", "science-0930313", "science-0931749"];
const EXPL = ["math-0811848", "math-0811855", "math-0811920", "math-0934655", "math-1080404", "math-1080404-122"];
const APPLY = process.argv.includes("--apply");
const bak = new Map(JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((r) => [r.id, r]));
const ids = [...UNHIDE, ...EXPL];
const rows = await fetchAll(`questions?select=id,needs_review,explanation&id=in.(${ids.join(",")})&order=id`);
const byId = new Map(rows.map((q) => [q.id, q]));
const changes = [];
for (const id of UNHIDE) if (byId.get(id)?.needs_review && bak.get(id)?.needs_review === false) changes.push({ id, patch: { needs_review: false } });
for (const id of EXPL) {
  // 0934655 原詳解結尾混進下一段標題「填充」(原檔區段名),寫回時拿掉
  const e = bak.get(id)?.explanation?.replace(/\s*填充\s*$/, "");
  if (byId.get(id) && !byId.get(id).explanation && e) changes.push({ id, patch: { explanation: e } });
}
console.log(`放回 ${changes.filter((c) => "needs_review" in c.patch).length} 題、詳解寫回 ${changes.filter((c) => "explanation" in c.patch).length} 題(預期 9 / 6)`);
for (const c of changes) console.log(`  ${c.id} → ${JSON.stringify(c.patch).slice(0, 90)}`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("undo-formula-fp", changes.map((c) => ({ id: c.id, needs_review: byId.get(c.id).needs_review, explanation: byId.get(c.id).explanation })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, c.patch));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/undo-formula-false-positives.mjs --restore "${file}"`);
