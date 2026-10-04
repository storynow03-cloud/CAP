// 清掉選項尾巴的出處標記(2026-10-04 最終品質檢查發現 1,027 題)
// 例:(D)「丙乙甲丁。【103教育會考】」→「丙乙甲丁。」——出處已記在 source 欄位,孩子不需要看到,
// 而且放在最後一個選項裡會讓選項長短不一、看起來像選項內容。只處理選項「結尾」的【…會考…/特招…】標記。
// 用法:node scripts/clean-option-tags.mjs [--apply] | --restore <備份檔>
import { fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const APPLY = process.argv.includes("--apply");
const TAG = /\s*【[^】]*(?:教育會考|會考類題|特招|會考)[^】]*】\s*$/;

const rows = await fetchAll("questions?select=id,options&type=eq.single_choice&order=id");
const changes = [];
for (const q of rows) {
  if (!q.options?.some((o) => TAG.test(o))) continue;
  const options = q.options.map((o) => o.replace(TAG, ""));
  if (options.some((o) => !o.replace(/<(?!img)[^>]+>/g, "").trim())) continue; // 清完變空白的不動(選項只有標記=另有問題)
  changes.push({ id: q.id, before: { options: q.options }, after: { options } });
}
console.log(`要清除出處標記 ${changes.length} 題`);
console.log(changes.slice(0, 3).map((c) => `${c.id}:「${c.before.options.at(-1).slice(-24)}」→「${c.after.options.at(-1).slice(-16)}」`).join("\n"));
if (APPLY) {
  const backupFile = writeBackup("option-tags", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/clean-option-tags.mjs --restore "${backupFile}"`);
}
