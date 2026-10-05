// 放回「通過全部嚴格檢查、卻仍隱藏」的題目(2026-10-05)
// 對象:data/rerender/item2-candidates.json(英文/社會/國文中查不到是誰隱藏的 = 原始匯入就隱藏;
//   以及 2026-10-04 hide-qa 隱藏、但題目已修好的)。
// 安全規則:needs_review 仍為 true;再跑一次 lib/question-checks 嚴格檢查;不在人工缺圖清單、不在題目回報裡;
//   題目(題幹/選項/非選答案)用到的每張圖都必須「已看過」(看圖檢查清單 / 2026-10-05 Claude 逐張看過的 item2-imgs)
//   或「已重畫」,且不在確認壞掉的清單。
// 用法:node scripts/unhide-clean.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";
import { problems } from "./lib/question-checks.mjs";
import { visibleProblems } from "./lib/visible-checks.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const cands = read("data/rerender/item2-candidates.json").map((x) => x.id);
const manual = new Set(fs.readFileSync(path.join(ROOT, "scripts/hide-missing-figure-questions.mjs"), "utf8")
  .match(/const BROKEN = \[([\s\S]*?)\];/)[1].match(/"[a-z]+-[\d-]+"/g).map((s) => s.slice(1, -1)));
const reported = new Set((await fetchAll("question_reports?select=question_id")).map((r) => r.question_id));
const bad = new Set(read("data/image-screen-confirmed.json").map((x) => x.p));
const seen = new Set([...read("data/image-screen-list.json").map((x) => x.p), ...read("data/rerender/item2-imgs.json"),
  ...read("data/rerender/map.json").map((x) => x.p), ...read("data/rerender/map-webp.json").map((x) => x.p)]);
// 一題一題查(id=in.(…) 大量查詢時回傳筆數不穩定)
const rows = [];
await runPool(cands, async (id) => {
  rows.push(...await fetchAll(`questions?select=id,subject,type,question,options,answer,answer_text,explanation,needs_review&id=eq.${encodeURIComponent(id)}`));
}, 8);
if (rows.length !== cands.length) throw new Error(`查到 ${rows.length} 題,應為 ${cands.length} 題`);
const back = [], why = {};
const skip = (k) => (why[k] = (why[k] ?? 0) + 1);
for (const q of rows) {
  if (!q.needs_review) { skip("已是可見"); continue; }
  if (problems(q).concat(visibleProblems(q)).length) { skip("嚴格檢查沒過"); continue; }
  if (manual.has(q.id)) { skip("人工缺圖清單"); continue; }
  if (reported.has(q.id)) { skip("有題目回報"); continue; }
  const srcs = [...[q.question, ...(q.options ?? []), q.answer_text ?? ""].join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (srcs.some((s) => bad.has(s))) { skip("有確認壞掉的圖"); continue; }
  if (srcs.some((s) => !seen.has(s))) { skip("有沒看過的圖"); continue; }
  back.push(q.id);
}
console.log(`候選 ${rows.length} 題,可放回 ${back.length} 題;跳過:`, why);
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("unhide-clean", back.map((id) => ({ id, needs_review: true })));
  console.log(`備份:${backupFile}`);
  await runPool(back, (id) => patchQuestion(id, { needs_review: false }));
  console.log(`✅ 已放回 ${back.length} 題`);
  console.log(`還原:node scripts/unhide-clean.mjs --restore "${backupFile}"`);
}
