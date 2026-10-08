// 清掉單獨的「ˉ」(U+02C9)雜字(2026-10-08)
// 「ˉˉˉˉ」連續出現 = 填空底線(題幹常見,保留)。單獨一個:
//   - answer_text:夾在小題之間「(1)－3600ˉ(2)－2」= Word 原本的分隔 → 換成全形空格
//   - question / options 結尾:「？ˉ」「b＞aˉ」= 雜字 → 刪掉
// 用法:node scripts/cleanup-stray-macron.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const SINGLE = /(?<!ˉ)ˉ(?!ˉ)/g;
const rows = await fetchAll("questions?select=id,question,options,answer_text&needs_review=eq.false&order=id");
const changes = [];
const stat = { 答案分隔: 0, 題幹結尾: 0, 選項結尾: 0 };
for (const q of rows) {
  const patch = {};
  if (q.answer_text && SINGLE.test(q.answer_text)) {
    patch.answer_text = q.answer_text.replace(SINGLE, "　").replace(/　+$/, "");
    stat.答案分隔++;
  }
  SINGLE.lastIndex = 0;
  const tail = (s) => (typeof s === "string" ? s.replace(/(?<!ˉ)ˉ(\s|<\/[^>]+>)*$/, "$1") : s);
  if (q.question && tail(q.question) !== q.question) { patch.question = tail(q.question); stat.題幹結尾++; }
  if (q.options?.some((o) => tail(o) !== o)) { patch.options = q.options.map(tail); stat.選項結尾++; }
  if (Object.keys(patch).length) changes.push({ id: q.id, patch, before: Object.fromEntries(Object.keys(patch).map((k) => [k, q[k]])) });
}
console.log(`要修改 ${changes.length} 題`, stat);
for (const c of changes.slice(0, 6)) for (const k of Object.keys(c.patch)) console.log(`  ${c.id} ${k}: …${JSON.stringify(c.before[k]).slice(-50)} → …${JSON.stringify(c.patch[k]).slice(-50)}`);
if (!APPLY) { console.log("(乾跑,未寫入)"); process.exit(0); }
const file = writeBackup("stray-macron", changes.map((c) => ({ id: c.id, ...c.before })));
console.log(`💾 備份 → ${file}`);
await runPool(changes, (c) => patchQuestion(c.id, c.patch));
console.log(`✅ 已修改 ${changes.length} 題。還原:node scripts/cleanup-stray-macron.mjs --restore "${file}"`);
