// 低解析圖改成 2 倍解析度重畫後(data/rerender/map-lowres.json),在題目 <img> 加上 width=原本寬度,
// 讓顯示大小不變、只是變清楚。已有 width 的不動。部署前後執行都安全(舊圖本來就是這個寬度)。
// 用法:node scripts/add-img-width.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
const ex = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, "data/rerender/exclude.json"), "utf8")));
const W = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/rerender/map-lowres.json"), "utf8"))
  .filter((x) => !ex.has(x.p)).map((x) => [x.p, Math.round(x.w / 2)]));
const fix = (s) => typeof s !== "string" ? s
  : s.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)\s*\/?>/g, (m, a, src, b) =>
    (W.has(src) && !/width=/.test(m)) ? `<img${a}src="${src}"${b} width="${W.get(src)}" />` : m);
const changes = [];
for (const s of ["social", "chinese", "english"]) {
  const rows = await fetchAll(`questions?select=id,question,options,explanation,answer_text&subject=eq.${s}`);
  for (const q of rows) {
    const after = { question: fix(q.question), options: q.options ? q.options.map(fix) : q.options, explanation: fix(q.explanation), answer_text: fix(q.answer_text) };
    const diff = {};
    for (const k of Object.keys(after)) if (JSON.stringify(after[k]) !== JSON.stringify(q[k])) diff[k] = after[k];
    if (Object.keys(diff).length) changes.push({ id: q.id, before: Object.fromEntries(Object.keys(diff).map((k) => [k, q[k]])), after: diff });
  }
}
console.log(`要加 width 的題目 ${changes.length} 題`);
if (changes[0]) console.log("例:", JSON.stringify(changes[0].after).match(/<img[^>]*>/)?.[0]);
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("img-width", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/add-img-width.mjs --restore "${backupFile}"`);
}
