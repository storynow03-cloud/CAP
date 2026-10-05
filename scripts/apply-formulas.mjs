// 數學:把 LibreOffice 畫壞的公式小圖(<img src="/qimg/math/...">)換成由原檔 OMML 轉出的 HTML
// 對應表 data/rerender/formulas.json(scripts/omml-formulas.py 產生,Claude 抽查 243 個全對)。
// 題幹、選項、詳解、非選答案都換;隱藏題也一起換(之後 unhide-fixed.mjs 才判斷能不能放回)。
// 不需要部署:用到的 .frac/.sqrt/.ovl/.brace 樣式已在線上 globals.css。
// 用法:node scripts/apply-formulas.mjs [--apply] | --restore <備份檔>
import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchAll, patchQuestion, runPool, writeBackup, restoreBackup } from "./lib/rest.mjs";

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  console.log(`✅ 已還原 ${await restoreBackup(process.argv[restoreIdx + 1])} 題`);
  process.exit(0);
}
// formulas.json:自動對應;formulas-manual.json:段落數量對不上、由 Claude 從候選公式目視挑選的
const readJ = (f) => fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) : [];
const map = new Map([...readJ("data/rerender/formulas.json"), ...readJ("data/rerender/formulas-manual.json")].map((x) => [x.p, x.html]));
const swap = (s) => typeof s !== "string" ? s
  : s.replace(/<img[^>]*src="(\/qimg\/math\/[^"]+)"[^>]*>/g, (m, src) => (map.has(src) ? map.get(src) : m));

const rows = await fetchAll("questions?select=id,question,options,explanation,answer_text&subject=eq.math&order=id");
const changes = [];
let imgs = 0;
for (const q of rows) {
  const after = { question: swap(q.question), options: (q.options ?? null) && q.options.map(swap), explanation: swap(q.explanation), answer_text: swap(q.answer_text) };
  const diff = {};
  for (const k of Object.keys(after)) if (JSON.stringify(after[k]) !== JSON.stringify(q[k])) diff[k] = after[k];
  if (!Object.keys(diff).length) continue;
  imgs += [q.question, ...(q.options ?? []), q.explanation, q.answer_text].join("\n").match(/<img[^>]*src="\/qimg\/math\/[^"]+"/g)
    .filter((t) => map.has(t.match(/src="([^"]+)"/)[1])).length;
  changes.push({ id: q.id, before: Object.fromEntries(Object.keys(diff).map((k) => [k, q[k]])), after: diff });
}
console.log(`數學 ${rows.length} 題,要改 ${changes.length} 題(換掉 ${imgs} 個公式圖)`);
console.log("例:", changes.slice(0, 2).map((c) => `${c.id}: ${JSON.stringify(c.after).slice(0, 200)}`).join("\n    "));
if (process.argv.includes("--apply")) {
  const backupFile = writeBackup("formulas", changes.map((c) => ({ id: c.id, ...c.before })));
  console.log(`備份:${backupFile}`);
  await runPool(changes, (c) => patchQuestion(c.id, c.after));
  console.log(`✅ 已更新 ${changes.length} 題`);
  console.log(`還原:node scripts/apply-formulas.mjs --restore "${backupFile}"`);
}
